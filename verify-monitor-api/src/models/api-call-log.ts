import { PrismaClient, APICallLog } from '@prisma/client';

const prisma = new PrismaClient();

export interface CallLogCreateData {
  service_id: string;
  date: Date;
  total_calls?: number;
  success_calls?: number;
  error_calls?: number;
  avg_response_time?: number;
  max_response_time?: number;
  min_response_time?: number;
}

export interface CallLogUpdateData {
  total_calls?: number;
  success_calls?: number;
  error_calls?: number;
  avg_response_time?: number;
  max_response_time?: number;
  min_response_time?: number;
}

export interface DailyCallMetrics {
  date: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  successRate: number;
  avgResponseTime: number;
}

export class APICallLogModel {
  static async create(data: CallLogCreateData): Promise<APICallLog> {
    return prisma.aPICallLog.create({
      data: {
        service_id: data.service_id,
        date: data.date,
        total_calls: data.total_calls || 0,
        success_calls: data.success_calls || 0,
        error_calls: data.error_calls || 0,
        avg_response_time: data.avg_response_time,
        max_response_time: data.max_response_time,
        min_response_time: data.min_response_time,
      },
    });
  }

  static async upsert(data: CallLogCreateData): Promise<APICallLog> {
    const dateKey = new Date(data.date);
    dateKey.setHours(0, 0, 0, 0);

    return prisma.aPICallLog.upsert({
      where: {
        service_id_date: {
          service_id: data.service_id,
          date: dateKey,
        },
      },
      update: {
        total_calls: data.total_calls || 0,
        success_calls: data.success_calls || 0,
        error_calls: data.error_calls || 0,
        avg_response_time: data.avg_response_time,
        max_response_time: data.max_response_time,
        min_response_time: data.min_response_time,
      },
      create: {
        service_id: data.service_id,
        date: dateKey,
        total_calls: data.total_calls || 0,
        success_calls: data.success_calls || 0,
        error_calls: data.error_calls || 0,
        avg_response_time: data.avg_response_time,
        max_response_time: data.max_response_time,
        min_response_time: data.min_response_time,
      },
    });
  }

  static async findByService(serviceId: string, days: number = 30): Promise<APICallLog[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return prisma.aPICallLog.findMany({
      where: {
        service_id: serviceId,
        date: {
          gte: startDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  static async findByServiceAndDate(serviceId: string, date: Date): Promise<APICallLog | null> {
    const dateKey = new Date(date);
    dateKey.setHours(0, 0, 0, 0);

    return prisma.aPICallLog.findUnique({
      where: {
        service_id_date: {
          service_id: serviceId,
          date: dateKey,
        },
      },
    });
  }

  static async findByServiceAndDateRange(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<APICallLog[]> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return prisma.aPICallLog.findMany({
      where: {
        service_id: serviceId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  static async getDailyMetrics(serviceId: string, days: number = 30): Promise<DailyCallMetrics[]> {
    const logs = await this.findByService(serviceId, days);

    return logs.map(log => {
      const dateStr = log.date.toISOString().split('T')[0] as string;
      return {
        date: dateStr,
        totalCalls: log.total_calls,
        successCalls: log.success_calls,
        errorCalls: log.error_calls,
        successRate: log.total_calls > 0
          ? parseFloat(((log.success_calls / log.total_calls) * 100).toFixed(2))
          : 0,
        avgResponseTime: log.avg_response_time || 0,
      };
    });
  }

  static async getMonthlyAggregates(
    serviceId: string,
    year: number,
    month: number
  ): Promise<{
    totalCalls: number;
    successCalls: number;
    errorCalls: number;
    successRate: number;
    avgResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    const logs = await this.findByServiceAndDateRange(serviceId, startDate, endDate);

    if (logs.length === 0) {
      return {
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        successRate: 0,
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
      };
    }

    const totalCalls = logs.reduce((sum, log) => sum + log.total_calls, 0);
    const successCalls = logs.reduce((sum, log) => sum + log.success_calls, 0);
    const errorCalls = logs.reduce((sum, log) => sum + log.error_calls, 0);

    // Calculate weighted average response time
    let weightedResponseTimeSum = 0;
    let totalCallsWithResponseTime = 0;

    logs.forEach(log => {
      if (log.avg_response_time && log.total_calls > 0) {
        weightedResponseTimeSum += log.avg_response_time * log.total_calls;
        totalCallsWithResponseTime += log.total_calls;
      }
    });

    const avgResponseTime = totalCallsWithResponseTime > 0 
      ? Math.round(weightedResponseTimeSum / totalCallsWithResponseTime)
      : 0;

    const maxResponseTime = Math.max(...logs.map(log => log.max_response_time || 0));
    const minResponseTime = Math.min(...logs.filter(log => log.min_response_time).map(log => log.min_response_time!));

    return {
      totalCalls,
      successCalls,
      errorCalls,
      successRate: totalCalls > 0 ? parseFloat(((successCalls / totalCalls) * 100).toFixed(2)) : 0,
      avgResponseTime,
      maxResponseTime,
      minResponseTime: minResponseTime === Infinity ? 0 : minResponseTime,
    };
  }

  static async incrementCalls(
    serviceId: string,
    date: Date,
    isSuccess: boolean,
    responseTime?: number
  ): Promise<APICallLog> {
    const dateKey = new Date(date);
    dateKey.setHours(0, 0, 0, 0);

    const existing = await this.findByServiceAndDate(serviceId, dateKey);

    if (existing) {
      const updateData: CallLogUpdateData = {
        total_calls: existing.total_calls + 1,
        success_calls: existing.success_calls + (isSuccess ? 1 : 0),
        error_calls: existing.error_calls + (isSuccess ? 0 : 1),
      };

      // Update response time statistics if provided
      if (responseTime !== undefined) {
        const totalCalls = existing.total_calls + 1;
        const currentSum = (existing.avg_response_time || 0) * existing.total_calls;
        const newSum = currentSum + responseTime;

        updateData.avg_response_time = Math.round(newSum / totalCalls);
        updateData.max_response_time = Math.max(existing.max_response_time || 0, responseTime);
        updateData.min_response_time = existing.min_response_time 
          ? Math.min(existing.min_response_time, responseTime)
          : responseTime;
      }

      return prisma.aPICallLog.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      return this.create({
        service_id: serviceId,
        date: dateKey,
        total_calls: 1,
        success_calls: isSuccess ? 1 : 0,
        error_calls: isSuccess ? 0 : 1,
        avg_response_time: responseTime,
        max_response_time: responseTime,
        min_response_time: responseTime,
      });
    }
  }

  static async getSuccessRateStats(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    overallSuccessRate: number;
    dailySuccessRates: Array<{
      date: string;
      successRate: number;
    }>;
    trend: 'improving' | 'declining' | 'stable';
  }> {
    const logs = await this.findByServiceAndDateRange(serviceId, startDate, endDate);

    if (logs.length === 0) {
      return {
        overallSuccessRate: 0,
        dailySuccessRates: [],
        trend: 'stable',
      };
    }

    const totalCalls = logs.reduce((sum, log) => sum + log.total_calls, 0);
    const totalSuccessCalls = logs.reduce((sum, log) => sum + log.success_calls, 0);
    const overallSuccessRate = totalCalls > 0 
      ? parseFloat(((totalSuccessCalls / totalCalls) * 100).toFixed(2))
      : 0;

    const dailySuccessRates = logs.map(log => {
      const dateStr = log.date.toISOString().split('T')[0] as string;
      return {
        date: dateStr,
        successRate: log.total_calls > 0
          ? parseFloat(((log.success_calls / log.total_calls) * 100).toFixed(2))
          : 0,
      };
    });

    // Calculate trend (compare first half vs second half)
    const mid = Math.floor(dailySuccessRates.length / 2);
    const firstHalf = dailySuccessRates.slice(0, mid);
    const secondHalf = dailySuccessRates.slice(mid);

    const firstHalfAvg = firstHalf.reduce((sum, day) => sum + day.successRate, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, day) => sum + day.successRate, 0) / secondHalf.length;

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (secondHalfAvg > firstHalfAvg + 1) {
      trend = 'improving';
    } else if (secondHalfAvg < firstHalfAvg - 1) {
      trend = 'declining';
    }

    return {
      overallSuccessRate,
      dailySuccessRates,
      trend,
    };
  }

  static async deleteOldRecords(days: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await prisma.aPICallLog.deleteMany({
      where: {
        created_at: {
          lt: cutoffDate,
        },
      },
    });
    
    return result.count;
  }

  static async getTopErrorDays(
    serviceId: string,
    days: number = 30,
    limit: number = 5
  ): Promise<Array<{
    date: string;
    errorCalls: number;
    errorRate: number;
  }>> {
    const logs = await this.findByService(serviceId, days);

    return logs
      .filter(log => log.error_calls > 0)
      .map(log => {
        const dateStr = log.date.toISOString().split('T')[0] as string;
        return {
          date: dateStr,
          errorCalls: log.error_calls,
          errorRate: log.total_calls > 0
            ? parseFloat(((log.error_calls / log.total_calls) * 100).toFixed(2))
            : 0,
        };
      })
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, limit);
  }
}

export default APICallLogModel;