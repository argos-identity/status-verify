import { PrismaClient, WatchServerLog, WatchErrorType } from '@prisma/client';

const prisma = new PrismaClient();

export interface HealthCheckResult {
  service_id: string;
  status_code?: number;
  response_time?: number;
  is_success: boolean;
  error_message?: string;
  error_type?: WatchErrorType;
}

export interface HealthCheckStats {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  uptimePercentage: number;
  avgResponseTime: number;
  errorsByType: Record<WatchErrorType, number>;
}

export class WatchServerLogModel {
  static async create(data: HealthCheckResult): Promise<WatchServerLog> {
    return prisma.watchServerLog.create({
      data: {
        service_id: data.service_id,
        status_code: data.status_code,
        response_time: data.response_time,
        is_success: data.is_success,
        error_message: data.error_message,
        error_type: data.error_type,
      },
    });
  }

  static async createBatch(data: HealthCheckResult[]): Promise<number> {
    const result = await prisma.watchServerLog.createMany({
      data: data.map(check => ({
        service_id: check.service_id,
        status_code: check.status_code,
        response_time: check.response_time,
        is_success: check.is_success,
        error_message: check.error_message,
        error_type: check.error_type,
      })),
    });
    
    return result.count;
  }

  static async findByService(serviceId: string, hours: number = 24): Promise<WatchServerLog[]> {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    return prisma.watchServerLog.findMany({
      where: {
        service_id: serviceId,
        check_time: {
          gte: startTime,
        },
      },
      orderBy: {
        check_time: 'desc',
      },
    });
  }

  static async findByServiceAndTimeRange(
    serviceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<WatchServerLog[]> {
    return prisma.watchServerLog.findMany({
      where: {
        service_id: serviceId,
        check_time: {
          gte: startTime,
          lte: endTime,
        },
      },
      orderBy: {
        check_time: 'asc',
      },
    });
  }

  static async getRecentCheck(serviceId: string): Promise<WatchServerLog | null> {
    return prisma.watchServerLog.findFirst({
      where: {
        service_id: serviceId,
      },
      orderBy: {
        check_time: 'desc',
      },
    });
  }

  static async getHealthStats(
    serviceId: string,
    hours: number = 24
  ): Promise<HealthCheckStats> {
    const logs = await this.findByService(serviceId, hours);

    if (logs.length === 0) {
      return {
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        uptimePercentage: 0,
        avgResponseTime: 0,
        errorsByType: {
          timeout: 0,
          connection_error: 0,
          http_error: 0,
          dns_error: 0,
        },
      };
    }

    const totalChecks = logs.length;
    const successfulChecks = logs.filter(log => log.is_success).length;
    const failedChecks = totalChecks - successfulChecks;
    const uptimePercentage = parseFloat(((successfulChecks / totalChecks) * 100).toFixed(2));

    const responseTimes = logs
      .filter(log => log.response_time !== null)
      .map(log => log.response_time!);
    
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
      : 0;

    const errorsByType: Record<WatchErrorType, number> = {
      timeout: 0,
      connection_error: 0,
      http_error: 0,
      dns_error: 0,
    };

    logs
      .filter(log => !log.is_success && log.error_type)
      .forEach(log => {
        errorsByType[log.error_type!]++;
      });

    return {
      totalChecks,
      successfulChecks,
      failedChecks,
      uptimePercentage,
      avgResponseTime,
      errorsByType,
    };
  }

  static async getUptimeForDate(serviceId: string, date: Date): Promise<{
    status: 'o' | 'po' | 'mo' | 'nd';
    responseTime: number | null;
    errorMessage: string | null;
  }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await this.findByServiceAndTimeRange(serviceId, startOfDay, endOfDay);

    if (logs.length === 0) {
      return {
        status: 'nd', // No data
        responseTime: null,
        errorMessage: null,
      };
    }

    const totalChecks = logs.length;
    const successfulChecks = logs.filter(log => log.is_success).length;
    const uptimePercentage = (successfulChecks / totalChecks) * 100;

    // Calculate average response time for successful checks
    const successfulLogs = logs.filter(log => log.is_success && log.response_time !== null);
    const avgResponseTime = successfulLogs.length > 0
      ? Math.round(successfulLogs.reduce((sum, log) => sum + log.response_time!, 0) / successfulLogs.length)
      : null;

    // Get the most recent error message if any
    const failedLogs = logs.filter(log => !log.is_success);
    const errorMessage = failedLogs.length > 0 ? failedLogs[0].error_message : null;

    let status: 'o' | 'po' | 'mo' | 'nd';

    if (uptimePercentage >= 95) {
      status = 'o'; // Operational
    } else if (uptimePercentage >= 50) {
      status = 'po'; // Partial outage
    } else {
      status = 'mo'; // Major outage
    }

    return {
      status,
      responseTime: avgResponseTime,
      errorMessage,
    };
  }

  static async getServiceStatus(serviceId: string): Promise<'operational' | 'degraded' | 'outage'> {
    const recentCheck = await this.getRecentCheck(serviceId);
    
    if (!recentCheck) {
      return 'operational'; // Default if no data
    }

    // Check if the service is currently down (recent check failed)
    if (!recentCheck.is_success) {
      return 'outage';
    }

    // Check last hour stats for degraded performance
    const hourlyStats = await this.getHealthStats(serviceId, 1);
    
    if (hourlyStats.uptimePercentage < 95) {
      return 'degraded';
    }

    return 'operational';
  }

  static async getDowntimeMinutes(
    serviceId: string,
    startTime: Date,
    endTime: Date,
    checkIntervalMinutes: number = 1
  ): Promise<number> {
    const logs = await this.findByServiceAndTimeRange(serviceId, startTime, endTime);
    
    const failedChecks = logs.filter(log => !log.is_success).length;
    return failedChecks * checkIntervalMinutes;
  }

  static async getOutages(
    serviceId: string,
    hours: number = 24
  ): Promise<Array<{
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    errorType: WatchErrorType | null;
    errorMessage: string | null;
  }>> {
    const logs = await this.findByService(serviceId, hours);
    const outages: Array<{
      startTime: Date;
      endTime: Date;
      durationMinutes: number;
      errorType: WatchErrorType | null;
      errorMessage: string | null;
    }> = [];

    let currentOutage: {
      startTime: Date;
      errorType: WatchErrorType | null;
      errorMessage: string | null;
    } | null = null;

    // Process logs in chronological order (oldest first)
    const sortedLogs = logs.sort((a, b) => a.check_time.getTime() - b.check_time.getTime());

    for (let i = 0; i < sortedLogs.length; i++) {
      const log = sortedLogs[i];
      
      if (!log.is_success && !currentOutage) {
        // Start of new outage
        currentOutage = {
          startTime: log.check_time,
          errorType: log.error_type,
          errorMessage: log.error_message,
        };
      } else if (log.is_success && currentOutage) {
        // End of outage
        const durationMs = log.check_time.getTime() - currentOutage.startTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        
        outages.push({
          startTime: currentOutage.startTime,
          endTime: log.check_time,
          durationMinutes,
          errorType: currentOutage.errorType,
          errorMessage: currentOutage.errorMessage,
        });
        
        currentOutage = null;
      }
    }

    // If there's an ongoing outage, use current time as end
    if (currentOutage) {
      const now = new Date();
      const durationMs = now.getTime() - currentOutage.startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      outages.push({
        startTime: currentOutage.startTime,
        endTime: now,
        durationMinutes,
        errorType: currentOutage.errorType,
        errorMessage: currentOutage.errorMessage,
      });
    }

    return outages;
  }

  static async deleteOldRecords(days: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await prisma.watchServerLog.deleteMany({
      where: {
        check_time: {
          lt: cutoffDate,
        },
      },
    });
    
    return result.count;
  }

  static async getCheckFrequency(serviceId: string, hours: number = 1): Promise<{
    expectedChecks: number;
    actualChecks: number;
    frequency: 'normal' | 'sparse' | 'missing';
  }> {
    const logs = await this.findByService(serviceId, hours);
    
    // Assuming 1-minute intervals
    const expectedChecks = hours * 60;
    const actualChecks = logs.length;
    
    let frequency: 'normal' | 'sparse' | 'missing';
    
    if (actualChecks === 0) {
      frequency = 'missing';
    } else if (actualChecks < expectedChecks * 0.8) {
      frequency = 'sparse';
    } else {
      frequency = 'normal';
    }

    return {
      expectedChecks,
      actualChecks,
      frequency,
    };
  }

  static async recordHealthCheck(
    serviceId: string,
    endpoint: string,
    timeoutMs: number = 10000
  ): Promise<WatchServerLog> {
    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // This would typically make an HTTP request to the endpoint
      // For now, we'll simulate it
      const response = await fetch(endpoint, {
        timeout: timeoutMs,
      });
      
      const responseTime = Date.now() - startTime;
      
      result = {
        service_id: serviceId,
        status_code: response.status,
        response_time: responseTime,
        is_success: response.ok,
        error_message: response.ok ? undefined : `HTTP ${response.status}`,
        error_type: response.ok ? undefined : 'http_error',
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      let errorType: WatchErrorType = 'connection_error';
      let errorMessage = error.message || 'Unknown error';

      if (error.name === 'AbortError' || errorMessage.includes('timeout')) {
        errorType = 'timeout';
        errorMessage = 'Request timeout';
      } else if (errorMessage.includes('DNS') || errorMessage.includes('ENOTFOUND')) {
        errorType = 'dns_error';
        errorMessage = 'DNS resolution failed';
      }

      result = {
        service_id: serviceId,
        response_time: responseTime > timeoutMs ? null : responseTime,
        is_success: false,
        error_message: errorMessage,
        error_type: errorType,
      };
    }

    return this.create(result);
  }
}

export default WatchServerLogModel;