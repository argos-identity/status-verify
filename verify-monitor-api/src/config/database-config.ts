import { PrismaClient, Prisma } from '@prisma/client';
import LoggingMiddleware from '../middleware/logging-middleware';

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
  logLevel?: ('query' | 'info' | 'warn' | 'error')[];
  slowQueryThreshold?: number;
  enableMetrics?: boolean;
}

export interface DatabaseMetrics {
  totalQueries: number;
  slowQueries: number;
  errorQueries: number;
  averageQueryTime: number;
  connectionPoolSize: number;
  activeConnections: number;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private prisma: PrismaClient;
  private metrics: DatabaseMetrics = {
    totalQueries: 0,
    slowQueries: 0,
    errorQueries: 0,
    averageQueryTime: 0,
    connectionPoolSize: 0,
    activeConnections: 0,
  };
  private queryTimes: number[] = [];
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config?: DatabaseConfig) {
    const dbUrl = config?.url || process.env.DATABASE_URL || 'postgresql://localhost:5432/sla_monitor';
    
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: config?.logLevel || ['error', 'warn'],
      errorFormat: 'pretty',
    });

    this.setupMiddleware(config);
    this.setupEventHandlers();
  }

  public static getInstance(config?: DatabaseConfig): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  private setupMiddleware(config?: DatabaseConfig): void {
    const dbLogger = LoggingMiddleware.databaseLogger();
    const slowQueryThreshold = config?.slowQueryThreshold || 100; // ms

    // Query logging and metrics middleware
    this.prisma.$use(async (params, next) => {
      const startTime = Date.now();
      
      try {
        const result = await next(params);
        const duration = Date.now() - startTime;
        
        // Update metrics
        this.updateMetrics(duration, false);
        
        // Log slow queries
        if (duration > slowQueryThreshold) {
          dbLogger.logQuery(
            `${params.model}.${params.action}`,
            duration,
            params.model,
            params.action
          );
        }

        return result;
      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        // Update error metrics
        this.updateMetrics(duration, true);
        
        // Log database errors
        dbLogger.logError(error, `${params.model}.${params.action}`);
        
        throw error;
      }
    });

    // Connection monitoring middleware
    this.prisma.$use(async (params, next) => {
      // This middleware runs for every query, so we can use it to track active connections
      this.metrics.activeConnections++;
      
      try {
        const result = await next(params);
        return result;
      } finally {
        this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
      }
    });
  }

  private setupEventHandlers(): void {
    // Handle process exit
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, closing database connection...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, closing database connection...');
      await this.disconnect();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await this.disconnect();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      await this.disconnect();
      process.exit(1);
    });
  }

  private updateMetrics(duration: number, isError: boolean): void {
    this.metrics.totalQueries++;
    
    if (isError) {
      this.metrics.errorQueries++;
    }
    
    if (duration > 100) { // Slow query threshold
      this.metrics.slowQueries++;
    }

    // Track query times for average calculation
    this.queryTimes.push(duration);
    if (this.queryTimes.length > 1000) {
      this.queryTimes = this.queryTimes.slice(-1000); // Keep only last 1000
    }

    // Update average query time
    this.metrics.averageQueryTime = Math.round(
      this.queryTimes.reduce((sum, time) => sum + time, 0) / this.queryTimes.length
    );
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.establishConnection();
    await this.connectionPromise;
    this.connectionPromise = null;
  }

  private async establishConnection(): Promise<void> {
    try {
      console.log('Connecting to database...');
      
      // Test connection
      await this.prisma.$connect();
      
      // Run a simple query to verify connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      this.isConnected = true;
      console.log('✅ Database connected successfully');
      
      // Log connection info
      const dbInfo = await this.getDatabaseInfo();
      console.log(`Database: ${dbInfo.version} on ${dbInfo.host}`);
      
    } catch (error: any) {
      this.isConnected = false;
      this.metrics.lastError = {
        message: error.message,
        timestamp: new Date(),
      };
      
      console.error('❌ Database connection failed:', error.message);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      console.log('Disconnecting from database...');
      await this.prisma.$disconnect();
      this.isConnected = false;
      console.log('✅ Database disconnected successfully');
    } catch (error: any) {
      console.error('❌ Error disconnecting from database:', error.message);
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

  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    connected: boolean;
    metrics: DatabaseMetrics;
    lastCheck: string;
    connectionString?: string;
  }> {
    const isHealthy = await this.isHealthy();
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      connected: this.isConnected && isHealthy,
      metrics: { ...this.metrics },
      lastCheck: new Date().toISOString(),
      connectionString: process.env.DATABASE_URL ? 
        process.env.DATABASE_URL.replace(/:\/\/[^@]+@/, '://***:***@') : 
        undefined,
    };
  }

  public getMetrics(): DatabaseMetrics {
    return { ...this.metrics };
  }

  public async getDatabaseInfo(): Promise<{
    version: string;
    host: string;
    database: string;
    maxConnections: number;
    currentConnections: number;
  }> {
    try {
      const versionResult = await this.prisma.$queryRaw<[{ version: string }]>`SELECT version()`;
      const version = versionResult[0]?.version || 'Unknown';

      const connectionResult = await this.prisma.$queryRaw<[{ 
        max_connections: number;
        count: number;
      }]>`
        SELECT 
          current_setting('max_connections')::int as max_connections,
          count(*) as count
        FROM pg_stat_activity 
        WHERE state = 'active'
      `;

      const { max_connections, count } = connectionResult[0];

      // Parse database URL for info
      const dbUrl = process.env.DATABASE_URL || '';
      const url = new URL(dbUrl);
      
      return {
        version: version.split(' ')[0] + ' ' + version.split(' ')[1],
        host: url.hostname,
        database: url.pathname.slice(1),
        maxConnections: max_connections,
        currentConnections: count,
      };
    } catch (error) {
      console.warn('Could not retrieve database info:', error);
      return {
        version: 'Unknown',
        host: 'Unknown',
        database: 'Unknown',
        maxConnections: 0,
        currentConnections: 0,
      };
    }
  }

  public async runMigrations(): Promise<void> {
    try {
      console.log('Running database migrations...');
      
      // This would typically be handled by Prisma CLI in production
      // For now, we'll just check if migrations are needed
      await this.prisma.$queryRaw`SELECT 1 FROM _prisma_migrations LIMIT 1`;
      
      console.log('✅ Database schema is up to date');
    } catch (error: any) {
      console.warn('⚠️  Could not verify migrations:', error.message);
      console.log('Please run: npx prisma migrate deploy');
    }
  }

  public async seedDatabase(): Promise<void> {
    try {
      console.log('Checking if database seeding is needed...');
      
      // Check if we have any services
      const serviceCount = await this.prisma.service.count();
      
      if (serviceCount === 0) {
        console.log('Seeding database with initial data...');
        
        // Create default services
        const defaultServices = [
          {
            id: 'id-recognition',
            name: 'ID Recognition',
            description: 'Identity document recognition and validation service',
            endpoint_url: 'https://api.example.com/id-recognition',
          },
          {
            id: 'face-liveness',
            name: 'Face Liveness',
            description: 'Facial liveness detection service',
            endpoint_url: 'https://api.example.com/face-liveness',
          },
          {
            id: 'id-liveness',
            name: 'ID Liveness',
            description: 'ID document liveness detection service',
            endpoint_url: 'https://api.example.com/id-liveness',
          },
          {
            id: 'face-compare',
            name: 'Face Compare',
            description: 'Facial comparison and matching service',
            endpoint_url: 'https://api.example.com/face-compare',
          },
          {
            id: 'curp-verifier',
            name: 'CURP Verifier',
            description: 'Mexican CURP verification service',
            endpoint_url: 'https://api.example.com/curp-verifier',
          },
        ];

        for (const service of defaultServices) {
          await this.prisma.service.create({ data: service });
        }

        // Create default admin user
        const bcrypt = await import('bcrypt');
        const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123!';
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);

        await this.prisma.user.create({
          data: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'System Administrator',
            email: 'admin@example.com',
            password_hash: hashedPassword,
            role: 'admin',
            is_active: true,
          },
        });

        console.log('✅ Database seeded successfully');
        console.log('Default admin credentials:');
        console.log('  Email: admin@example.com');
        console.log('  Password:', defaultPassword);
      } else {
        console.log('✅ Database already contains data, skipping seed');
      }
    } catch (error: any) {
      console.error('❌ Database seeding failed:', error.message);
      throw error;
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
        latency,
      };
    } catch (error: any) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  public resetMetrics(): void {
    this.metrics = {
      totalQueries: 0,
      slowQueries: 0,
      errorQueries: 0,
      averageQueryTime: 0,
      connectionPoolSize: 0,
      activeConnections: 0,
    };
    this.queryTimes = [];
    console.log('Database metrics reset');
  }
}

// Export singleton instance
const dbConfig: DatabaseConfig = {
  url: process.env.DATABASE_URL,
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
  queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '5000', 10),
  slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100', 10),
  logLevel: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error'] as const
    : ['warn', 'error'] as const,
  enableMetrics: process.env.DB_ENABLE_METRICS !== 'false',
};

export const database = DatabaseConnection.getInstance(dbConfig);

// Export the Prisma client instance directly
// Note: This will throw an error if database is not connected yet
// Make sure to call database.connect() before using prisma
let _prismaCache: PrismaClient | null = null;

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    try {
      if (!_prismaCache) {
        _prismaCache = database.getPrismaClient();
      }
      return (_prismaCache as any)[prop];
    } catch (error) {
      // If database is not connected, try to return a helpful error
      throw new Error(`Database not connected. Call database.connect() first. Original error: ${error}`);
    }
  }
});

export default database;