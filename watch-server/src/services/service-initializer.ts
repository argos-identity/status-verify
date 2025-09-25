import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import database from '../config/database';
import { getServiceConfigs } from '../test-data/health-check-data';

class ServiceInitializer {
  private static instance: ServiceInitializer;
  private logger: winston.Logger;
  private prisma!: PrismaClient;

  private constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
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
  }

  private async initializePrisma(): Promise<void> {
    if (!this.prisma) {
      this.prisma = database.getPrismaClient();
    }
  }

  public static getInstance(): ServiceInitializer {
    if (!ServiceInitializer.instance) {
      ServiceInitializer.instance = new ServiceInitializer();
    }
    return ServiceInitializer.instance;
  }

  public async initializeServices(): Promise<void> {
    try {
      await this.initializePrisma();
      this.logger.info('🚀 Initializing services in database...');

      const serviceConfigs = getServiceConfigs();
      let createdCount = 0;
      let updatedCount = 0;

      for (const config of serviceConfigs) {
        const existingService = await this.prisma.service.findUnique({
          where: { id: config.id }
        });

        if (!existingService) {
          // Create new service
          await this.prisma.service.create({
            data: {
              id: config.id,
              name: config.name,
              description: `${config.name} service monitoring`,
              endpoint_url: config.url
            }
          });
          createdCount++;
          this.logger.info(`✅ Created service: ${config.name} (${config.id})`);
        } else {
          // Update existing service URL if changed
          if (existingService.endpoint_url !== config.url) {
            await this.prisma.service.update({
              where: { id: config.id },
              data: {
                endpoint_url: config.url,
                updated_at: new Date()
              }
            });
            updatedCount++;
            this.logger.info(`🔄 Updated service URL: ${config.name} (${config.id})`);
          }
        }
      }

      this.logger.info(`🎉 Service initialization completed`, {
        total: serviceConfigs.length,
        created: createdCount,
        updated: updatedCount,
        existing: serviceConfigs.length - createdCount
      });

    } catch (error: any) {
      this.logger.error('❌ Failed to initialize services', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  public async ensureServiceExists(serviceId: string): Promise<boolean> {
    try {
      await this.initializePrisma();
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId }
      });

      if (!service) {
        this.logger.warn(`⚠️ Service ${serviceId} not found in database`);
        return false;
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to check service existence: ${serviceId}`, error);
      return false;
    }
  }

  public async getServiceInfo(serviceId: string): Promise<any> {
    try {
      await this.initializePrisma();
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId }
      });

      return service;
    } catch (error: any) {
      this.logger.error(`Failed to get service info: ${serviceId}`, error);
      return null;
    }
  }

  public async getAllServices(): Promise<any[]> {
    try {
      await this.initializePrisma();
      const services = await this.prisma.service.findMany({
        orderBy: {
          name: 'asc'
        }
      });

      return services;
    } catch (error: any) {
      this.logger.error('Failed to get all services', error);
      return [];
    }
  }

  public async getServiceHealth(): Promise<any> {
    try {
      await this.initializePrisma();
      const services = await this.getAllServices();
      const healthSummary = [];

      for (const service of services) {
        // Get latest uptime record
        const latestUptime = await this.prisma.uptimeRecord.findFirst({
          where: { service_id: service.id },
          orderBy: { date: 'desc' }
        });

        // Get latest watch server log
        const latestLog = await this.prisma.watchServerLog.findFirst({
          where: { service_id: service.id },
          orderBy: { check_time: 'desc' }
        });

        healthSummary.push({
          id: service.id,
          name: service.name,
          status: latestUptime?.status || 'nd',
          lastCheck: latestLog?.check_time || null,
          responseTime: latestLog?.response_time || null,
          isSuccess: latestLog?.is_success || false
        });
      }

      return healthSummary;
    } catch (error: any) {
      this.logger.error('Failed to get service health', error);
      return [];
    }
  }
}

const serviceInitializer = ServiceInitializer.getInstance();
export default serviceInitializer;