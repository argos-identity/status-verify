import { PrismaClient, UptimeRecord } from '@prisma/client';

const prisma = new PrismaClient();

export interface MonthlyUptimeData {
  name: string;
  uptime: string;
  days: string[];
}

export interface UptimeStatsResponse {
  service: {
    id: string;
    name: string;
  };
  months: MonthlyUptimeData[];
}

export class UptimeRecordModel {
  static async findByService(serviceId: string, days: number = 90): Promise<UptimeRecord[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return prisma.uptimeRecord.findMany({
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

  static async findByServiceAndDateRange(
    serviceId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<UptimeRecord[]> {
    return prisma.uptimeRecord.findMany({
      where: {
        service_id: serviceId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  static async findByDate(serviceId: string, date: Date): Promise<UptimeRecord | null> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.uptimeRecord.findFirst({
      where: {
        service_id: serviceId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  static async create(data: Omit<UptimeRecord, 'id' | 'created_at'>): Promise<UptimeRecord> {
    return prisma.uptimeRecord.create({
      data,
    });
  }

  static async upsert(data: Omit<UptimeRecord, 'id' | 'created_at'>): Promise<UptimeRecord> {
    return prisma.uptimeRecord.upsert({
      where: {
        service_id_date: {
          service_id: data.service_id,
          date: data.date,
        },
      },
      update: {
        status: data.status,
        response_time: data.response_time,
        error_message: data.error_message,
      },
      create: data,
    });
  }

  static async getMonthlyStats(
    serviceId: string,
    months: number = 3,
    startDate?: Date
  ): Promise<Array<{
    name: string;
    year: number;
    month: number;
    uptime: string;
    days: ('o' | 'po' | 'mo' | 'nd' | 'e')[];
    totalDays: number;
    operationalDays: number;
    partialOutageDays: number;
    majorOutageDays: number;
    noDataDays: number;
  }>> {
    const endDate = startDate || new Date();
    const monthsData: Array<{
      name: string;
      year: number;
      month: number;
      uptime: string;
      days: ('o' | 'po' | 'mo' | 'nd' | 'e')[];
      totalDays: number;
      operationalDays: number;
      partialOutageDays: number;
      majorOutageDays: number;
      noDataDays: number;
    }> = [];
    
    for (let i = 0; i < months; i++) {
      const monthStart = new Date(endDate);
      monthStart.setMonth(endDate.getMonth() - i, 1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthStart.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      
      const records = await prisma.uptimeRecord.findMany({
        where: {
          service_id: serviceId,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        orderBy: {
          date: 'asc',
        },
      });
      
      // Generate days array for this month
      const daysInMonth = monthEnd.getDate();
      const days: ('o' | 'po' | 'mo' | 'nd' | 'e')[] = [];
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(monthStart);
        dayDate.setDate(day);
        dayDate.setHours(0, 0, 0, 0);
        
        const record = records.find(r => {
          const recordDate = new Date(r.date);
          recordDate.setHours(0, 0, 0, 0);
          return recordDate.getTime() === dayDate.getTime();
        });
        
        days.push(record?.status || 'e');
      }
      
      // Calculate uptime percentage for this month
      const operationalDays = days.filter(status => status === 'o').length;
      const uptimePercentage = daysInMonth > 0 
        ? ((operationalDays / daysInMonth) * 100).toFixed(2)
        : '0.00';
      
      // Format month name
      const monthName = monthStart.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
      const partialOutageDays = days.filter(status => status === 'po').length;
      const majorOutageDays = days.filter(status => status === 'mo').length;
      const noDataDays = days.filter(status => status === 'nd' || status === 'e').length;

      monthsData.push({
        name: monthName,
        year: monthStart.getFullYear(),
        month: monthStart.getMonth() + 1,
        uptime: uptimePercentage,
        days,
        totalDays: daysInMonth,
        operationalDays,
        partialOutageDays,
        majorOutageDays,
        noDataDays,
      });
    }
    
    return monthsData;
  }

  static async calculateUptimePercentage(
    serviceId: string, 
    days: number = 30
  ): Promise<string> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const records = await prisma.uptimeRecord.findMany({
      where: {
        service_id: serviceId,
        date: {
          gte: startDate,
        },
      },
    });
    
    if (records.length === 0) {
      return '0.00';
    }
    
    const operationalDays = records.filter(record => record.status === 'o').length;
    return ((operationalDays / records.length) * 100).toFixed(2);
  }

  /**
   * Get daily uptime status for a service over a specified number of days
   * Maps UptimeRecord status to frontend status strings
   */
  static async getDailyUptimeStatus(
    serviceId: string,
    startDate: Date,
    endDate: Date,
    totalDays: number,
    serviceName?: string
  ): Promise<{
    uptimeData: Array<'operational' | 'degraded' | 'outage' | 'partial'>;
    uptimePercentage: string;
  }> {
    // Get uptime records for the service in the date range
    const records = await prisma.uptimeRecord.findMany({
      where: {
        service_id: serviceId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    const uptimeData: Array<'operational' | 'degraded' | 'outage' | 'partial'> = [];

    // Generate status for each day based on watch-server monitoring data
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      currentDate.setHours(0, 0, 0, 0);

      // Find the uptime record for this specific day
      const record = records.find(r => {
        const recordDate = new Date(r.date);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === currentDate.getTime();
      });

      // Map UptimeRecord status to frontend status
      let dayStatus: 'operational' | 'degraded' | 'outage' | 'partial';
      if (!record || record.status === 'e' || record.status === 'nd') {
        dayStatus = 'operational'; // Default to operational for missing data
      } else {
        switch (record.status) {
          case 'o':
            dayStatus = 'operational';
            break;
          case 'po':
            dayStatus = 'partial';
            break;
          case 'mo':
            dayStatus = 'outage';
            break;
          default:
            dayStatus = 'operational';
        }
      }

      uptimeData.push(dayStatus);
    }

    // Calculate uptime percentage based on actual monitoring data
    const uptimePercentage = this.calculateUptimeFromMonitoringData(uptimeData, serviceName);

    return {
      uptimeData,
      uptimePercentage,
    };
  }

  /**
   * Calculate uptime percentage from watch-server monitoring data
   * Independent of incidents - only based on actual service availability
   */
  private static calculateUptimeFromMonitoringData(
    uptimeData: Array<'operational' | 'degraded' | 'outage' | 'partial'>,
    serviceName?: string
  ): string {
    // 데이터가 없을 때는 정상 상태로 간주하고 99.99% 반환
    if (uptimeData.length === 0) return '99.99';

    const totalScore = uptimeData.reduce((score, status) => {
      switch (status) {
        case 'operational': return score + 1.0;   // 100% uptime
        case 'degraded': return score + 0.75;     // 75% uptime (performance issues but service available)
        case 'partial': return score + 0.5;       // 50% uptime (some functionality affected)
        case 'outage': return score + 0.0;        // 0% uptime (service completely down)
        default: return score + 1.0;              // Default to operational
      }
    }, 0);


    let uptimePercentage = (totalScore / uptimeData.length) * 100;
    // 정상 상태 (99.95% 이상)일 때 다른 서비스들은 99.99% 적용
    if (uptimePercentage >= 99.95) {
      return '99.99';
    }

    // 실제 장애가 있을 때는 watch-server 데이터 기반 계산값 그대로 사용
    return uptimePercentage.toFixed(2);
  }

  /**
   * Simple hash function for consistent randomization
   */
  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  static async deleteOldRecords(days: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.uptimeRecord.deleteMany({
      where: {
        created_at: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

export default UptimeRecordModel;