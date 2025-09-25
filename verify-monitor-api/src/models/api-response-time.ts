import { PrismaClient, APIResponseTime } from '@prisma/client';

const prisma = new PrismaClient();

export interface ResponseTimeMetrics {
  totalRequests: number;
  avgResponseTime: number;
  slowRequests300: {
    count: number;
    percentage: number;
  };
  slowRequests500: {
    count: number;
    percentage: number;
  };
  timeoutRequests: {
    count: number;
    percentage: number;
  };
}

export interface ResponseTimeStatsInput {
  service_id: string;
  response_time: number;
  status_code: number;
  endpoint?: string;
  method?: string;
}

export class APIResponseTimeModel {
  static async create(data: ResponseTimeStatsInput): Promise<APIResponseTime> {
    return prisma.aPIResponseTime.create({
      data: {
        service_id: data.service_id,
        response_time: data.response_time,
        status_code: data.status_code,
        endpoint: data.endpoint,
        method: data.method || 'GET',
      },
    });
  }

  static async createBatch(data: ResponseTimeStatsInput[]): Promise<number> {
    const result = await prisma.aPIResponseTime.createMany({
      data: data.map(item => ({
        service_id: item.service_id,
        response_time: item.response_time,
        status_code: item.status_code,
        endpoint: item.endpoint,
        method: item.method || 'GET',
      })),
    });
    
    return result.count;
  }

  static async getMetricsForPeriod(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ResponseTimeMetrics> {
    const records = await prisma.aPIResponseTime.findMany({
      where: {
        service_id: serviceId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    if (records.length === 0) {
      return {
        totalRequests: 0,
        avgResponseTime: 0,
        slowRequests300: { count: 0, percentage: 0 },
        slowRequests500: { count: 0, percentage: 0 },
        timeoutRequests: { count: 0, percentage: 0 },
      };
    }

    const totalRequests = records.length;
    const avgResponseTime = Math.round(
      records.reduce((sum, record) => sum + record.response_time, 0) / totalRequests
    );

    // Calculate slow requests (300% of average baseline)
    const baselineResponseTime = avgResponseTime;
    const slowThreshold300 = baselineResponseTime * 3;
    const slowRequests300Count = records.filter(r => r.response_time > slowThreshold300).length;

    // Calculate very slow requests (500% of average baseline)
    const slowThreshold500 = baselineResponseTime * 5;
    const slowRequests500Count = records.filter(r => r.response_time > slowThreshold500).length;

    // Calculate timeout requests (>7 seconds absolute threshold)
    const timeoutThreshold = 7000; // 7 seconds in ms
    const timeoutRequestsCount = records.filter(r => r.response_time > timeoutThreshold).length;

    return {
      totalRequests,
      avgResponseTime,
      slowRequests300: {
        count: slowRequests300Count,
        percentage: parseFloat(((slowRequests300Count / totalRequests) * 100).toFixed(2)),
      },
      slowRequests500: {
        count: slowRequests500Count,
        percentage: parseFloat(((slowRequests500Count / totalRequests) * 100).toFixed(2)),
      },
      timeoutRequests: {
        count: timeoutRequestsCount,
        percentage: parseFloat(((timeoutRequestsCount / totalRequests) * 100).toFixed(2)),
      },
    };
  }

  static async getMonthlyMetrics(serviceId: string, year: number, month: number): Promise<ResponseTimeMetrics> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return this.getMetricsForPeriod(serviceId, startDate, endDate);
  }

  static async getDailyMetrics(serviceId: string, date: Date): Promise<ResponseTimeMetrics> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    return this.getMetricsForPeriod(serviceId, startDate, endDate);
  }

  static async getRecentMetrics(serviceId: string, hours: number = 24): Promise<ResponseTimeMetrics> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (hours * 60 * 60 * 1000));
    
    return this.getMetricsForPeriod(serviceId, startDate, endDate);
  }

  static async getPercentileStats(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  }> {
    const records = await prisma.aPIResponseTime.findMany({
      where: {
        service_id: serviceId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        response_time: true,
      },
      orderBy: {
        response_time: 'asc',
      },
    });

    if (records.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const responseTimes = records.map(r => r.response_time);
    const len = responseTimes.length;

    return {
      p50: responseTimes[Math.floor(len * 0.5)],
      p90: responseTimes[Math.floor(len * 0.9)],
      p95: responseTimes[Math.floor(len * 0.95)],
      p99: responseTimes[Math.floor(len * 0.99)],
      min: responseTimes[0],
      max: responseTimes[len - 1],
    };
  }

  static async getEndpointStats(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    endpoint: string;
    method: string;
    count: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
  }>> {
    const result = await prisma.aPIResponseTime.groupBy({
      by: ['endpoint', 'method'],
      where: {
        service_id: serviceId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: {
        id: true,
      },
      _avg: {
        response_time: true,
      },
      _min: {
        response_time: true,
      },
      _max: {
        response_time: true,
      },
    });

    return result.map(item => ({
      endpoint: item.endpoint || 'unknown',
      method: item.method,
      count: item._count.id,
      avgResponseTime: Math.round(item._avg.response_time || 0),
      minResponseTime: item._min.response_time || 0,
      maxResponseTime: item._max.response_time || 0,
    }));
  }

  static async deleteOldRecords(days: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await prisma.aPIResponseTime.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
    
    return result.count;
  }

  static async getServiceResponseTimeTarget(serviceId: string): Promise<number> {
    // Default SLA target is 7 seconds (7000ms)
    // This could be made configurable per service
    return 7000;
  }

  static async calculateSLACompliance(
    serviceId: string,
    startDate: Date,
    endDate: Date,
    targetMs: number = 7000
  ): Promise<{
    totalRequests: number;
    compliantRequests: number;
    compliancePercentage: number;
    breaches: number;
  }> {
    const records = await prisma.aPIResponseTime.findMany({
      where: {
        service_id: serviceId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        response_time: true,
      },
    });

    const totalRequests = records.length;
    const compliantRequests = records.filter(r => r.response_time <= targetMs).length;
    const breaches = totalRequests - compliantRequests;
    const compliancePercentage = totalRequests > 0 
      ? parseFloat(((compliantRequests / totalRequests) * 100).toFixed(2))
      : 100;

    return {
      totalRequests,
      compliantRequests,
      compliancePercentage,
      breaches,
    };
  }
}

export default APIResponseTimeModel;