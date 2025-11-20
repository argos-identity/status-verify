import winston from 'winston';
import { PrismaClient, UptimeStatus, WatchErrorType } from '@prisma/client';
import { ServiceHealthResult } from '../types';
import database from '../config/database';

class MetricsService {
  private static instance: MetricsService;
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
        new winston.transports.Console()
      ]
    });
  }

  private async initializePrisma(): Promise<void> {
    if (!this.prisma) {
      this.prisma = database.getPrismaClient();
    }
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public async createMonitoringSession(results: ServiceHealthResult[]): Promise<{ sessionId: string }> {
    const sessionId = `session-${Date.now()}`;

    try {
      // Ensure Prisma is initialized
      await this.initializePrisma();
      // Save individual health check results to WatchServerLog
      await this.saveHealthCheckResults(results);

      // Save individual response times to APIResponseTime
      await this.saveAPIResponseTimes(results);

      // Update daily statistics in APICallLog
      await this.updateDailyStatistics(results);

      // Update uptime records
      await this.updateUptimeRecords(results);

      this.logger.info(`📊 Monitoring session created: ${sessionId}`, {
        sessionId,
        resultsCount: results.length,
        savedToDatabase: true
      });
    } catch (error: any) {
      this.logger.error('Failed to save monitoring session to database', {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      // For monitoring, we don't want to completely fail if DB is down
      // Log the error but continue monitoring
      this.logger.warn('⚠️ Continuing monitoring without database persistence');
    }

    return { sessionId };
  }

  private async saveHealthCheckResults(results: ServiceHealthResult[]): Promise<void> {
    const watchServerLogs = results.map(result => ({
      service_id: result.serviceId,
      check_time: result.timestamp,
      status_code: result.httpStatus,
      response_time: result.responseTime,
      is_success: result.status === 'operational',
      error_message: result.error || null,
      error_type: this.determineErrorType(result)
    }));

    await this.prisma.watchServerLog.createMany({
      data: watchServerLogs
    });

    this.logger.debug(`💾 Saved ${watchServerLogs.length} health check results to WatchServerLog`);
  }

  private async saveAPIResponseTimes(results: ServiceHealthResult[]): Promise<void> {
    const responseTimeRecords = results.map(result => ({
      service_id: result.serviceId,
      response_time: result.responseTime,
      status_code: result.httpStatus,
      endpoint: result.url,
      method: 'POST',
      timestamp: result.timestamp
    }));

    await this.prisma.aPIResponseTime.createMany({
      data: responseTimeRecords
    });

    this.logger.debug(`💾 Saved ${responseTimeRecords.length} response time records to APIResponseTime`);
  }

  private async updateDailyStatistics(results: ServiceHealthResult[]): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const result of results) {
      const isSuccess = result.status === 'operational';

      await this.prisma.aPICallLog.upsert({
        where: {
          service_id_date: {
            service_id: result.serviceId,
            date: today
          }
        },
        update: {
          total_calls: { increment: 1 },
          success_calls: { increment: isSuccess ? 1 : 0 },
          error_calls: { increment: isSuccess ? 0 : 1 },
          updated_at: new Date()
        },
        create: {
          service_id: result.serviceId,
          date: today,
          total_calls: 1,
          success_calls: isSuccess ? 1 : 0,
          error_calls: isSuccess ? 0 : 1,
          avg_response_time: result.responseTime,
          max_response_time: result.responseTime,
          min_response_time: result.responseTime
        }
      });

      // Update response time statistics
      await this.updateResponseTimeStatistics(result.serviceId, today, result.responseTime);
    }

    this.logger.debug(`📈 Updated daily statistics for ${results.length} services`);
  }

  private async updateResponseTimeStatistics(serviceId: string, date: Date, responseTime: number): Promise<void> {
    const existingLog = await this.prisma.aPICallLog.findUnique({
      where: {
        service_id_date: { service_id: serviceId, date }
      }
    });

    if (existingLog) {
      const totalCalls = existingLog.total_calls;
      const currentAvg = existingLog.avg_response_time || 0;
      const newAvg = Math.round(((currentAvg * (totalCalls - 1)) + responseTime) / totalCalls);

      await this.prisma.aPICallLog.update({
        where: {
          service_id_date: { service_id: serviceId, date }
        },
        data: {
          avg_response_time: newAvg,
          max_response_time: Math.max(existingLog.max_response_time || 0, responseTime),
          min_response_time: Math.min(existingLog.min_response_time || Number.MAX_SAFE_INTEGER, responseTime)
        }
      });
    }
  }

  private async updateUptimeRecords(results: ServiceHealthResult[]): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const result of results) {
      const status = this.mapToUptimeStatus(result.status, result.httpStatus);

      await this.prisma.uptimeRecord.upsert({
        where: {
          service_id_date: {
            service_id: result.serviceId,
            date: today
          }
        },
        update: {
          status,
          response_time: result.responseTime,
          error_message: result.error || null
        },
        create: {
          service_id: result.serviceId,
          date: today,
          status,
          response_time: result.responseTime,
          error_message: result.error || null
        }
      });
    }

    this.logger.debug(`📅 Updated uptime records for ${results.length} services`);
  }

  private determineErrorType(result: ServiceHealthResult): WatchErrorType | null {
    if (!result.error) return null;

    const errorMessage = result.error.toLowerCase();

    if (errorMessage.includes('timeout')) return WatchErrorType.timeout;
    if (errorMessage.includes('connection') || errorMessage.includes('connect')) return WatchErrorType.connection_error;
    if (errorMessage.includes('dns') || errorMessage.includes('getaddrinfo')) return WatchErrorType.dns_error;
    if (result.httpStatus >= 400) return WatchErrorType.http_error;

    return WatchErrorType.connection_error;
  }

  private mapToUptimeStatus(status: string, httpStatus: number): UptimeStatus {
    if (status === 'operational') return UptimeStatus.o;
    if (httpStatus >= 400 && httpStatus < 500) return UptimeStatus.po; // Partial outage for 4xx
    if (httpStatus >= 500 || status === 'down') return UptimeStatus.mo; // Major outage for 5xx or down
    return UptimeStatus.nd; // No data for other cases
  }

  public async calculateServiceMetrics(serviceId: string, startDate: Date, endDate: Date): Promise<any> {
    this.logger.info(`📈 Calculating metrics for ${serviceId}`, {
      serviceId,
      period: { start: startDate, end: endDate }
    });

    try {
      await this.initializePrisma();
      // Get API call statistics
      const apiStats = await this.prisma.aPICallLog.aggregate({
        where: {
          service_id: serviceId,
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          total_calls: true,
          success_calls: true,
          error_calls: true
        },
        _avg: {
          avg_response_time: true
        }
      });

      // Get response time statistics
      const responseTimeStats = await this.prisma.aPIResponseTime.aggregate({
        where: {
          service_id: serviceId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        _avg: {
          response_time: true
        },
        _min: {
          response_time: true
        },
        _max: {
          response_time: true
        },
        _count: true
      });

      // Calculate uptime percentage
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const uptimeRecords = await this.prisma.uptimeRecord.findMany({
        where: {
          service_id: serviceId,
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const operationalDays = uptimeRecords.filter(record => record.status === UptimeStatus.o).length;
      const uptimePercentage = totalDays > 0 ? (operationalDays / totalDays) * 100 : 0;

      return {
        serviceId,
        period: { start: startDate, end: endDate, days: totalDays },
        uptime: Math.round(uptimePercentage * 100) / 100,
        avgResponseTime: Math.round(responseTimeStats._avg.response_time || 0),
        minResponseTime: responseTimeStats._min.response_time || 0,
        maxResponseTime: responseTimeStats._max.response_time || 0,
        totalRequests: apiStats._sum.total_calls || 0,
        successfulRequests: apiStats._sum.success_calls || 0,
        failedRequests: apiStats._sum.error_calls || 0,
        totalMeasurements: responseTimeStats._count || 0,
        averageCalculatedResponseTime: Math.round(apiStats._avg.avg_response_time || 0)
      };
    } catch (error: any) {
      this.logger.error(`Failed to calculate metrics for ${serviceId}`, error);

      // Return fallback metrics if database is unavailable
      return {
        serviceId,
        period: { start: startDate, end: endDate, days: 0 },
        uptime: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalMeasurements: 0,
        averageCalculatedResponseTime: 0,
        error: 'Database unavailable'
      };
    }
  }

  public async getSLAMetrics(serviceId: string, days: number): Promise<any> {
    try {
      await this.initializePrisma();
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      // Get SLA target from environment or default to 99.9%
      const slaTarget = parseFloat(process.env.SLA_TARGET || '99.9');

      // Calculate current SLA
      const metrics = await this.calculateServiceMetrics(serviceId, startDate, endDate);
      const currentSLA = metrics.uptime;

      // Count SLA breaches (days with uptime < target)
      const uptimeRecords = await this.prisma.uptimeRecord.findMany({
        where: {
          service_id: serviceId,
          date: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const breaches = uptimeRecords.filter(record =>
        record.status === UptimeStatus.po || record.status === UptimeStatus.mo
      ).length;

      // Calculate response time SLA (assume target is < 5000ms)
      const responseTimeSLA = await this.prisma.aPIResponseTime.aggregate({
        where: {
          service_id: serviceId,
          timestamp: {
            gte: startDate,
            lte: endDate
          },
          response_time: {
            lte: 5000 // 5 second SLA
          }
        },
        _count: true
      });

      const totalResponseTimes = await this.prisma.aPIResponseTime.count({
        where: {
          service_id: serviceId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      const responseTimeSLAPercentage = totalResponseTimes > 0
        ? (responseTimeSLA._count / totalResponseTimes) * 100
        : 100;

      return {
        serviceId,
        days,
        slaTarget,
        currentSLA: Math.round(currentSLA * 100) / 100,
        breaches,
        responseTimeSLA: Math.round(responseTimeSLAPercentage * 100) / 100,
        isBreached: currentSLA < slaTarget,
        period: { start: startDate, end: endDate }
      };
    } catch (error: any) {
      this.logger.error(`Failed to calculate SLA metrics for ${serviceId}`, error);
      throw error;
    }
  }

  public async calculateAllServiceMetrics(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      await this.initializePrisma();
      // Get all services from database
      const services = await this.prisma.service.findMany();

      const allMetrics = [];

      for (const service of services) {
        const metrics = await this.calculateServiceMetrics(service.id, startDate, endDate);
        allMetrics.push({
          ...metrics,
          serviceName: service.name,
          description: service.description
        });
      }

      return allMetrics;
    } catch (error: any) {
      this.logger.error('Failed to calculate all service metrics', error);
      throw error;
    }
  }

  public async getSystemHealthSummary(): Promise<any> {
    try {
      await this.initializePrisma();
      // Get latest uptime records for all services
      const latestRecords = await this.prisma.uptimeRecord.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        orderBy: {
          date: 'desc'
        }
      });

      // Count services by status
      const statusCounts = latestRecords.reduce((acc, record) => {
        acc[record.status] = (acc[record.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalServices = await this.prisma.service.count();
      const operationalServices = statusCounts[UptimeStatus.o] || 0;
      const degradedServices = statusCounts[UptimeStatus.po] || 0;
      const downServices = statusCounts[UptimeStatus.mo] || 0;

      // Determine overall health
      let overallHealth = 'operational';
      if (downServices > 0) {
        overallHealth = 'outage';
      } else if (degradedServices > 0) {
        overallHealth = 'degraded';
      }

      // Get last update time
      const lastUpdate = await this.prisma.watchServerLog.findFirst({
        orderBy: {
          check_time: 'desc'
        }
      });

      return {
        overallHealth,
        totalServices,
        operationalServices,
        degradedServices,
        downServices,
        lastUpdateTime: lastUpdate?.check_time || new Date(),
        statusDistribution: statusCounts
      };
    } catch (error: any) {
      this.logger.error('Failed to get system health summary', error);
      throw error;
    }
  }

  public async performDailyMaintenance(): Promise<void> {
    this.logger.info('🧹 Performing daily maintenance...');

    try {
      await this.initializePrisma();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      // Clean up old detailed logs (keep only 30 days)
      const deletedLogs = await this.prisma.watchServerLog.deleteMany({
        where: {
          check_time: {
            lt: thirtyDaysAgo
          }
        }
      });

      this.logger.info(`🗑️ Deleted ${deletedLogs.count} old watch server logs`);

      // Clean up old API response times (keep only 30 days)
      const deletedResponseTimes = await this.prisma.aPIResponseTime.deleteMany({
        where: {
          timestamp: {
            lt: thirtyDaysAgo
          }
        }
      });

      this.logger.info(`🗑️ Deleted ${deletedResponseTimes.count} old API response time records`);

      // Clean up old API call logs (keep only 90 days)
      const deletedCallLogs = await this.prisma.aPICallLog.deleteMany({
        where: {
          date: {
            lt: ninetyDaysAgo
          }
        }
      });

      this.logger.info(`🗑️ Deleted ${deletedCallLogs.count} old API call logs`);

      // Update system status
      const systemSummary = await this.getSystemHealthSummary();
      await this.prisma.systemStatus.create({
        data: {
          overall_status: systemSummary.overallHealth === 'operational' ? 'operational' :
                         systemSummary.overallHealth === 'degraded' ? 'degraded' : 'outage',
          message: `System health: ${systemSummary.operationalServices}/${systemSummary.totalServices} services operational`
        }
      });

      this.logger.info('✅ Daily maintenance completed successfully');
    } catch (error: any) {
      this.logger.error('❌ Daily maintenance failed', error);
      throw error;
    }
  }
}

const metricsService = MetricsService.getInstance();
export default metricsService;