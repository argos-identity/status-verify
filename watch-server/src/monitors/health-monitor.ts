import axios, { AxiosResponse, AxiosError } from 'axios';
import winston from 'winston';
import database from '../config/database';
import { SERVICE_CONFIGS, WATCH_SERVER_CONFIG } from '../config/services';
import {
  ServiceConfig,
  ServiceHealthResult,
  HealthCheckError,
  UptimeRecordData,
  APIResponseTimeData,
  WatchServerLogData
} from '../types';

class HealthMonitor {
  private static instance: HealthMonitor;
  private logger: winston.Logger;
  private isMonitoring: boolean = false;

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
  }

  public static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      this.logger.warn('Health monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.logger.info('<¯ Starting health monitoring for all services');

    // Initial health check
    await this.performHealthChecks();

    this.logger.info(' Health monitoring started successfully');
  }

  public async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.logger.info('=Ñ Health monitoring stopped');
  }

  public async performHealthChecks(): Promise<ServiceHealthResult[]> {
    const results: ServiceHealthResult[] = [];

    this.logger.info(`= Performing health checks for ${SERVICE_CONFIGS.length} services`);

    // Check all services in parallel
    const healthCheckPromises = SERVICE_CONFIGS.map(serviceConfig => 
      this.checkServiceHealth(serviceConfig)
    );

    const healthResults = await Promise.allSettled(healthCheckPromises);

    for (let i = 0; i < healthResults.length; i++) {
      const result = healthResults[i];
      const serviceConfig = SERVICE_CONFIGS[i];

      if (result.status === 'fulfilled') {
        results.push(result.value);
        this.logger.info(` Health check completed for ${serviceConfig.name}`, {
          serviceId: serviceConfig.id,
          status: result.value.status,
          responseTime: result.value.responseTime
        });
      } else {
        // Create failed result
        const failedResult: ServiceHealthResult = {
          serviceId: serviceConfig.id,
          serviceName: serviceConfig.name,
          url: serviceConfig.url,
          status: 'down',
          httpStatus: 0,
          responseTime: WATCH_SERVER_CONFIG.monitoring.timeout,
          timestamp: new Date(),
          error: result.reason?.message || 'Unknown error'
        };
        results.push(failedResult);

        this.logger.error(`L Health check failed for ${serviceConfig.name}`, {
          serviceId: serviceConfig.id,
          error: result.reason?.message || 'Unknown error'
        });
      }
    }

    // Save results to database
    await this.saveHealthResults(results);

    return results;
  }

  private async checkServiceHealth(serviceConfig: ServiceConfig): Promise<ServiceHealthResult> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;

    // Retry logic
    while (attempt <= serviceConfig.retryCount) {
      try {
        this.logger.debug(`= Health check attempt ${attempt + 1} for ${serviceConfig.name}`);

        const response: AxiosResponse = await axios({
          method: serviceConfig.method,
          url: serviceConfig.url,
          headers: serviceConfig.headers,
          timeout: serviceConfig.timeout,
          validateStatus: () => true // Don't throw on non-2xx status codes
        });

        const responseTime = Date.now() - startTime;

        // Determine service status based on HTTP status code
        let status: 'operational' | 'degraded' | 'down';
        
        if (serviceConfig.expectedStatus?.includes(response.status) || response.status === 200) {
          status = 'operational';
        } else if (response.status >= 400 && response.status < 500) {
          status = 'degraded'; // Client errors might be temporary
        } else {
          status = 'down'; // Server errors or other issues
        }

        const healthResult: ServiceHealthResult = {
          serviceId: serviceConfig.id,
          serviceName: serviceConfig.name,
          url: serviceConfig.url,
          status,
          httpStatus: response.status,
          responseTime,
          timestamp: new Date(),
          response: response.data,
          metadata: {
            attempt: attempt + 1,
            maxRetries: serviceConfig.retryCount + 1
          }
        };

        // Log successful check
        this.logger.info(`<¯ Health check success for ${serviceConfig.name}`, {
          serviceId: serviceConfig.id,
          status: response.status,
          responseTime: `${responseTime}ms`,
          attempt: attempt + 1
        });

        return healthResult;

      } catch (error: any) {
        lastError = error;
        attempt++;

        const isTimeout = error.code === 'ECONNABORTED';
        const isConnectionError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';

        this.logger.warn(`   Health check attempt ${attempt} failed for ${serviceConfig.name}`, {
          serviceId: serviceConfig.id,
          error: error.message,
          code: error.code,
          attempt,
          willRetry: attempt <= serviceConfig.retryCount
        });

        if (attempt <= serviceConfig.retryCount) {
          // Wait before retry
          await this.delay(serviceConfig.retryDelay * Math.pow(2, attempt - 1)); // Exponential backoff
        }
      }
    }

    // All retries exhausted, return failed result
    const responseTime = Date.now() - startTime;
    const healthResult: ServiceHealthResult = {
      serviceId: serviceConfig.id,
      serviceName: serviceConfig.name,
      url: serviceConfig.url,
      status: 'down',
      httpStatus: 0,
      responseTime,
      timestamp: new Date(),
      error: lastError?.message || 'Health check failed after all retries',
      metadata: {
        attempt: serviceConfig.retryCount + 1,
        maxRetries: serviceConfig.retryCount + 1,
        failureReason: lastError?.code || 'unknown'
      }
    };

    throw new HealthCheckError(
      `Health check failed for ${serviceConfig.name} after ${serviceConfig.retryCount + 1} attempts`,
      serviceConfig.id,
      0,
      responseTime
    );
  }

  private async saveHealthResults(results: ServiceHealthResult[]): Promise<void> {
    try {
      const prisma = database.getPrismaClient();
      const now = new Date();

      for (const result of results) {
        // Save to WatchServerLog table
        const watchLogData: WatchServerLogData = {
          service_id: result.serviceId,
          check_time: result.timestamp,
          status_code: result.httpStatus,
          response_time: result.responseTime,
          is_success: result.status === 'operational',
          error_message: result.error || null,
          error_type: this.getErrorType(result)
        };

        await prisma.watchServerLog.create({
          data: {
            service_id: watchLogData.service_id,
            check_time: watchLogData.check_time,
            status_code: watchLogData.status_code,
            response_time: watchLogData.response_time,
            is_success: watchLogData.is_success,
            error_message: watchLogData.error_message,
            error_type: watchLogData.error_type
          }
        });

        // Save to APIResponseTime table for SLA calculations
        const apiResponseData: APIResponseTimeData = {
          service_id: result.serviceId,
          response_time: result.responseTime,
          status_code: result.httpStatus,
          endpoint: result.url,
          method: 'GET',
          timestamp: result.timestamp
        };

        await prisma.aPIResponseTime.create({
          data: {
            service_id: apiResponseData.service_id,
            response_time: apiResponseData.response_time,
            status_code: apiResponseData.status_code,
            endpoint: apiResponseData.endpoint,
            method: apiResponseData.method,
            timestamp: apiResponseData.timestamp
          }
        });

        // Update or create UptimeRecord for today
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const uptimeStatus = result.status === 'operational' ? 'o' : 
                           result.status === 'degraded' ? 'po' : 'mo';

        await prisma.uptimeRecord.upsert({
          where: {
            service_id_date: {
              service_id: result.serviceId,
              date: today
            }
          },
          update: {
            status: uptimeStatus as any,
            response_time: result.responseTime,
            error_message: result.error || null
          },
          create: {
            service_id: result.serviceId,
            date: today,
            status: uptimeStatus as any,
            response_time: result.responseTime,
            error_message: result.error || null
          }
        });
      }

      this.logger.info(`=¾ Saved ${results.length} health check results to database`);
    } catch (error: any) {
      this.logger.error('L Failed to save health results to database', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  private getErrorType(result: ServiceHealthResult): string | null {
    if (result.status === 'operational') {
      return null;
    }

    if (result.responseTime >= WATCH_SERVER_CONFIG.monitoring.timeout) {
      return 'timeout';
    }

    if (result.httpStatus === 0) {
      return 'connection_error';
    }

    if (result.httpStatus >= 400) {
      return 'http_error';
    }

    return 'connection_error';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async getHealthStatus(): Promise<{
    isMonitoring: boolean;
    lastCheckTime?: Date;
    serviceStatus: Record<string, 'operational' | 'degraded' | 'down'>;
  }> {
    const serviceStatus: Record<string, 'operational' | 'degraded' | 'down'> = {};

    try {
      const prisma = database.getPrismaClient();
      
      // Get latest health check for each service
      for (const config of SERVICE_CONFIGS) {
        const latestCheck = await prisma.watchServerLog.findFirst({
          where: { service_id: config.id },
          orderBy: { check_time: 'desc' }
        });

        if (latestCheck) {
          serviceStatus[config.id] = latestCheck.is_success ? 'operational' : 'down';
        } else {
          serviceStatus[config.id] = 'down';
        }
      }

      return {
        isMonitoring: this.isMonitoring,
        serviceStatus
      };
    } catch (error: any) {
      this.logger.error('Failed to get health status', error);
      throw error;
    }
  }
}

// Export singleton instance
const healthMonitor = HealthMonitor.getInstance();
export default healthMonitor;