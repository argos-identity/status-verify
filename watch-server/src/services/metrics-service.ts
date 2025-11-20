import winston from 'winston';
import database from '../config/database';
import { SERVICE_CONFIGS, getAllServiceIds } from '../config/services';
import {
  ServiceMetrics,
  APICallLog,
  ServiceHealthResult,
  MonitoringSession
} from '../types';

class MetricsService {
  private static instance: MetricsService;
  private logger: winston.Logger;

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

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public async calculateServiceMetrics(
    serviceId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<ServiceMetrics> {
    try {
      const prisma = database.getPrismaClient();

      // Get all health checks for the service in the date range
      const healthChecks = await prisma.watchServerLog.findMany({
        where: {
          service_id: serviceId,
          check_time: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          check_time: 'asc'
        }
      });

      if (healthChecks.length === 0) {
        return this.createEmptyMetrics(serviceId);
      }

      const successfulChecks = healthChecks.filter(check => check.is_success);
      const failedChecks = healthChecks.filter(check => !check.is_success);

      // Calculate uptime percentage
      const uptime = (successfulChecks.length / healthChecks.length) * 100;

      // Calculate average response time (only for successful checks)
      const avgResponseTime = successfulChecks.length > 0 
        ? successfulChecks.reduce((sum, check) => sum + (check.response_time || 0), 0) / successfulChecks.length
        : 0;

      // Get latest check status
      const latestCheck = healthChecks[healthChecks.length - 1];
      const currentStatus = latestCheck.is_success ? 'operational' : 'down';

      const metrics: ServiceMetrics = {
        serviceId,
        uptime: Math.round(uptime * 100) / 100, // Round to 2 decimal places
        avgResponseTime: Math.round(avgResponseTime),
        totalRequests: healthChecks.length,
        successfulRequests: successfulChecks.length,
        failedRequests: failedChecks.length,
        lastCheck: latestCheck.check_time,
        status: currentStatus
      };

      this.logger.debug(`=� Calculated metrics for ${serviceId}`, {
        serviceId,
        uptime: metrics.uptime,
        totalRequests: metrics.totalRequests,
        avgResponseTime: metrics.avgResponseTime
      });

      return metrics;

    } catch (error: any) {
      this.logger.error(`L Failed to calculate metrics for ${serviceId}`, {
        serviceId,
        error: error.message
      });
      throw error;
    }
  }

  public async calculateAllServiceMetrics(
    startDate: Date, 
    endDate: Date
  ): Promise<ServiceMetrics[]> {
    const serviceIds = getAllServiceIds();
    const metricsPromises = serviceIds.map(serviceId => 
      this.calculateServiceMetrics(serviceId, startDate, endDate)
    );

    const results = await Promise.allSettled(metricsPromises);
    const metrics: ServiceMetrics[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const serviceId = serviceIds[i];

      if (result.status === 'fulfilled') {
        metrics.push(result.value);
      } else {
        this.logger.error(`Failed to get metrics for ${serviceId}`, result.reason);
        metrics.push(this.createEmptyMetrics(serviceId));
      }
    }

    this.logger.info(`=� Calculated metrics for ${metrics.length} services`);
    return metrics;
  }

  public async updateDailyAPICallLogs(date: Date): Promise<void> {
    try {
      const prisma = database.getPrismaClient();
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

      for (const serviceId of getAllServiceIds()) {
        // Get all API response times for this service on this date
        const apiResponses = await prisma.aPIResponseTime.findMany({
          where: {
            service_id: serviceId,
            timestamp: {
              gte: startOfDay,
              lte: endOfDay
            }
          }
        });

        if (apiResponses.length === 0) {
          continue;
        }

        const successResponses = apiResponses.filter(r => r.status_code >= 200 && r.status_code < 400);
        const errorResponses = apiResponses.filter(r => r.status_code >= 400);

        const responseTimes = successResponses
          .map(r => r.response_time)
          .filter(rt => rt > 0);

        const avgResponseTime = responseTimes.length > 0 
          ? Math.round(responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length)
          : null;

        const maxResponseTime = responseTimes.length > 0 
          ? Math.max(...responseTimes)
          : null;

        const minResponseTime = responseTimes.length > 0 
          ? Math.min(...responseTimes)
          : null;

        // Upsert daily API call log
        await prisma.aPICallLog.upsert({
          where: {
            service_id_date: {
              service_id: serviceId,
              date: startOfDay
            }
          },
          update: {
            total_calls: apiResponses.length,
            success_calls: successResponses.length,
            error_calls: errorResponses.length,
            avg_response_time: avgResponseTime,
            max_response_time: maxResponseTime,
            min_response_time: minResponseTime,
            updated_at: new Date()
          },
          create: {
            service_id: serviceId,
            date: startOfDay,
            total_calls: apiResponses.length,
            success_calls: successResponses.length,
            error_calls: errorResponses.length,
            avg_response_time: avgResponseTime,
            max_response_time: maxResponseTime,
            min_response_time: minResponseTime
          }
        });
      }

      this.logger.info(`=� Updated daily API call logs for ${date.toISOString().split('T')[0]}`);

    } catch (error: any) {
      this.logger.error('L Failed to update daily API call logs', {
        error: error.message,
        date: date.toISOString()
      });
      throw error;
    }
  }

  public async getSLAMetrics(
    serviceId: string, 
    days: number = 30
  ): Promise<{
    availability: number;
    avgResponseTime: number;
    errorRate: number;
    totalRequests: number;
    period: { start: Date; end: Date };
  }> {
    try {
      const prisma = database.getPrismaClient();
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      // Get uptime records for the period
      const uptimeRecords = await prisma.uptimeRecord.findMany({
        where: {
          service_id: serviceId,
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      // Calculate availability (percentage of operational days)
      const operationalDays = uptimeRecords.filter(record => record.status === 'o').length;
      const totalDays = uptimeRecords.length;
      const availability = totalDays > 0 ? (operationalDays / totalDays) * 100 : 0;

      // Get API response metrics for the period
      const apiResponses = await prisma.aPIResponseTime.findMany({
        where: {
          service_id: serviceId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const successfulResponses = apiResponses.filter(r => r.status_code >= 200 && r.status_code < 400);
      const totalRequests = apiResponses.length;
      const errorRate = totalRequests > 0 ? ((totalRequests - successfulResponses.length) / totalRequests) * 100 : 0;

      const avgResponseTime = successfulResponses.length > 0
        ? Math.round(successfulResponses.reduce((sum, r) => sum + r.response_time, 0) / successfulResponses.length)
        : 0;

      return {
        availability: Math.round(availability * 100) / 100,
        avgResponseTime,
        errorRate: Math.round(errorRate * 100) / 100,
        totalRequests,
        period: { start: startDate, end: endDate }
      };

    } catch (error: any) {
      this.logger.error(`L Failed to calculate SLA metrics for ${serviceId}`, {
        serviceId,
        error: error.message
      });
      throw error;
    }
  }

  public async getSystemHealthSummary(): Promise<{
    totalServices: number;
    operationalServices: number;
    degradedServices: number;
    downServices: number;
    overallStatus: 'operational' | 'degraded' | 'outage';
    lastUpdateTime: Date;
  }> {
    try {
      const prisma = database.getPrismaClient();
      const serviceIds = getAllServiceIds();
      const serviceStatuses: Array<'operational' | 'degraded' | 'down'> = [];

      // Get latest status for each service
      for (const serviceId of serviceIds) {
        const latestCheck = await prisma.watchServerLog.findFirst({
          where: { service_id: serviceId },
          orderBy: { check_time: 'desc' }
        });

        if (latestCheck) {
          if (latestCheck.is_success) {
            serviceStatuses.push('operational');
          } else if (latestCheck.status_code && latestCheck.status_code >= 400 && latestCheck.status_code < 500) {
            serviceStatuses.push('degraded');
          } else {
            serviceStatuses.push('down');
          }
        } else {
          serviceStatuses.push('down');
        }
      }

      const operationalServices = serviceStatuses.filter(s => s === 'operational').length;
      const degradedServices = serviceStatuses.filter(s => s === 'degraded').length;
      const downServices = serviceStatuses.filter(s => s === 'down').length;

      // Determine overall system status
      let overallStatus: 'operational' | 'degraded' | 'outage';
      if (downServices === 0 && degradedServices === 0) {
        overallStatus = 'operational';
      } else if (downServices >= serviceIds.length / 2) {
        overallStatus = 'outage';
      } else {
        overallStatus = 'degraded';
      }

      return {
        totalServices: serviceIds.length,
        operationalServices,
        degradedServices,
        downServices,
        overallStatus,
        lastUpdateTime: new Date()
      };

    } catch (error: any) {
      this.logger.error('L Failed to get system health summary', {
        error: error.message
      });
      throw error;
    }
  }

  public async createMonitoringSession(results: ServiceHealthResult[]): Promise<MonitoringSession> {
    const sessionId = this.generateSessionId();
    const startTime = new Date();

    const successfulChecks = results.filter(r => r.status === 'operational').length;
    const failedChecks = results.length - successfulChecks;

    const avgResponseTime = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.responseTime, 0) / results.length)
      : 0;

    const session: MonitoringSession = {
      sessionId,
      startTime,
      endTime: new Date(),
      totalServices: results.length,
      successfulChecks,
      failedChecks,
      avgResponseTime,
      results
    };

    this.logger.info(`=� Created monitoring session ${sessionId}`, {
      sessionId,
      totalServices: session.totalServices,
      successfulChecks,
      failedChecks,
      avgResponseTime
    });

    return session;
  }

  private createEmptyMetrics(serviceId: string): ServiceMetrics {
    return {
      serviceId,
      uptime: 0,
      avgResponseTime: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      lastCheck: new Date(),
      status: 'down'
    };
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `session-${timestamp}-${random}`;
  }

  public async performDailyMaintenance(): Promise<void> {
    try {
      this.logger.info('🧹 Starting daily maintenance tasks');

      // Update yesterday's API call logs
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await this.updateDailyAPICallLogs(yesterday);

      // Clean up old data (older than 90 days)
      await this.cleanupOldData(90);

      this.logger.info(' Daily maintenance completed');

    } catch (error: any) {
      this.logger.error('L Daily maintenance failed', {
        error: error.message
      });
      throw error;
    }
  }

  private async cleanupOldData(retentionDays: number): Promise<void> {
    try {
      const prisma = database.getPrismaClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Clean up old watch server logs
      const deletedLogs = await prisma.watchServerLog.deleteMany({
        where: {
          check_time: {
            lt: cutoffDate
          }
        }
      });

      // Clean up old API response times
      const deletedResponses = await prisma.aPIResponseTime.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });

      this.logger.info(`>� Cleaned up old data`, {
        deletedLogs: deletedLogs.count,
        deletedResponses: deletedResponses.count,
        retentionDays
      });

    } catch (error: any) {
      this.logger.error('L Failed to cleanup old data', {
        error: error.message
      });
      throw error;
    }
  }
}

// Export singleton instance
const metricsService = MetricsService.getInstance();
export default metricsService;