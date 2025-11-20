import { PrismaClient } from '@prisma/client';
import winston from 'winston';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private prisma: PrismaClient;
  private logger: winston.Logger;
  private isConnected: boolean = false;

  private constructor() {
    // Initialize logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Initialize Prisma client
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      },
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }


  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.prisma.$connect();
      
      // Test connection with a simple query
      await this.prisma.$queryRaw`SELECT 1`;
      
      this.isConnected = true;
      this.logger.info('✅ Watch Server connected to database successfully');
      
      // Log database info
      const result = await this.prisma.$queryRaw<{version: string}[]>`SELECT version()`;
      if (result[0]) {
        this.logger.info(`Database: ${result[0].version.split(' ')[0]} ${result[0].version.split(' ')[1]}`);
      }
      
    } catch (error: any) {
      this.isConnected = false;
      this.logger.error('❌ Watch Server database connection failed', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      this.logger.info('✅ Watch Server disconnected from database');
    } catch (error: any) {
      this.logger.error('❌ Error disconnecting from database', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  public getPrismaClient(): PrismaClient {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.prisma;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async getConnectionInfo(): Promise<{
    connected: boolean;
    version: string;
    url: string;
  }> {
    try {
      const result = await this.prisma.$queryRaw<{version: string}[]>`SELECT version()`;
      const version = result[0]?.version || 'Unknown';
      
      return {
        connected: this.isConnected,
        version: version.split(' ')[0] + ' ' + version.split(' ')[1],
        url: process.env.DATABASE_URL ? 
          process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@') : 
          'Not configured'
      };
    } catch (error: any) {
      this.logger.error('Error getting database info', error);
      return {
        connected: false,
        version: 'Unknown',
        url: 'Error retrieving'
      };
    }
  }

  public async testConnection(): Promise<{
    success: boolean;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      await this.prisma.$queryRaw`SELECT 1 as test`;
      const latency = Date.now() - startTime;
      
      return {
        success: true,
        latency
      };
    } catch (error: any) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }

  // Health check for the watch server
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: {
      connected: boolean;
      latency: number;
      version: string;
    };
    timestamp: string;
  }> {
    const connectionTest = await this.testConnection();
    const connectionInfo = await this.getConnectionInfo();
    
    return {
      status: connectionTest.success ? 'healthy' : 'unhealthy',
      database: {
        connected: connectionTest.success,
        latency: connectionTest.latency,
        version: connectionInfo.version
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
const database = DatabaseConnection.getInstance();

// Setup graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🔄 Received ${signal}. Closing database connection...`);
  try {
    await database.disconnect();
    console.log('✅ Database connection closed gracefully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await database.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  await database.disconnect();
  process.exit(1);
});

export default database;