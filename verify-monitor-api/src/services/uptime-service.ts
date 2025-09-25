import UptimeRecordModel from '../models/uptime-record';
import ServiceModel from '../models/service';
import WatchServerLogModel from '../models/watch-server-log';
import APIResponseTimeModel from '../models/api-response-time';
import { UptimeRecord } from '@prisma/client';

export interface UptimeStats {
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
  uptime90d: number;
}

export interface DayStatus {
  date: string;
  status: 'o' | 'po' | 'mo' | 'nd' | 'e';
  uptime: number;
  incidents: number;
  avgResponseTime?: number;
}

export interface MonthlyUptimeData {
  service: {
    id: string;
    name: string;
  };
  months: Array<{
    name: string;
    year: number;
    month: number;
    uptime: string;
    days: DayStatus[];
    totalDays: number;
    operationalDays: number;
    partialOutageDays: number;
    majorOutageDays: number;
    noDataDays: number;
  }>;
}

export interface UptimeSummary {
  serviceId: string;
  serviceName: string;
  currentStatus: 'operational' | 'degraded' | 'outage';
  uptimePercentage: number;
  lastCheck: Date | null;
  totalChecks24h: number;
  successfulChecks24h: number;
  avgResponseTime24h: number;
  incidents24h: number;
}

export class UptimeService {
  async getServiceUptime(
    serviceId: string,
    months: number = 3,
    startDate?: Date
  ): Promise<MonthlyUptimeData> {
    try {
      // Validate service exists
      const service = await ServiceModel.findById(serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Validate months parameter
      if (months < 1 || months > 12) {
        throw new Error('Months parameter must be between 1 and 12');
      }

      // Get monthly uptime data from the model
      const monthsData = await UptimeRecordModel.getMonthlyStats(serviceId, months, startDate);

      // Transform the data to include additional statistics
      const enhancedMonthsData = monthsData.map(monthData => {
        const statusCounts = monthData.days.reduce(
          (acc, day) => {
            acc[day === 'o' ? 'operational' : 
               day === 'po' ? 'partialOutage' :
               day === 'mo' ? 'majorOutage' : 'noData']++;
            return acc;
          },
          { operational: 0, partialOutage: 0, majorOutage: 0, noData: 0 }
        );

        return {
          ...monthData,
          totalDays: monthData.days.length,
          operationalDays: statusCounts.operational,
          partialOutageDays: statusCounts.partialOutage,
          majorOutageDays: statusCounts.majorOutage,
          noDataDays: statusCounts.noData,
        };
      });

      return {
        service: {
          id: service.id,
          name: service.name,
        },
        months: enhancedMonthsData,
      };
    } catch (error: any) {
      console.error(`Error getting uptime for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to retrieve service uptime');
    }
  }

  async getServiceUptimeStats(serviceId: string): Promise<UptimeStats> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      // Get uptime percentages for different time periods
      const [uptime24h, uptime7d, uptime30d, uptime90d] = await Promise.all([
        UptimeRecordModel.calculateUptimePercentage(serviceId, 1),
        UptimeRecordModel.calculateUptimePercentage(serviceId, 7),
        UptimeRecordModel.calculateUptimePercentage(serviceId, 30),
        UptimeRecordModel.calculateUptimePercentage(serviceId, 90),
      ]);

      return {
        uptime24h: parseFloat(uptime24h),
        uptime7d: parseFloat(uptime7d),
        uptime30d: parseFloat(uptime30d),
        uptime90d: parseFloat(uptime90d),
      };
    } catch (error: any) {
      console.error(`Error getting uptime stats for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to retrieve uptime statistics');
    }
  }

  async recordDailyUptime(
    serviceId: string,
    date: Date,
    status: 'o' | 'po' | 'mo' | 'nd' | 'e',
    responseTime?: number,
    errorMessage?: string
  ): Promise<UptimeRecord> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      // Validate status
      const validStatuses = ['o', 'po', 'mo', 'nd', 'e'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status value');
      }

      return await UptimeRecordModel.upsert({
        service_id: serviceId,
        date,
        status,
        response_time: responseTime,
        error_message: errorMessage,
      });
    } catch (error: any) {
      console.error(`Error recording uptime for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to record uptime data');
    }
  }

  async getAllServicesUptimeSummary(): Promise<UptimeSummary[]> {
    try {
      const services = await ServiceModel.findAll();
      const summaries: UptimeSummary[] = [];

      for (const service of services) {
        try {
          // Get current status from watch server logs
          const currentStatus = await WatchServerLogModel.getServiceStatus(service.id);
          
          // Get 24-hour statistics
          const stats24h = await WatchServerLogModel.getHealthStats(service.id, 24);
          
          // Get recent check information
          const recentCheck = await WatchServerLogModel.getRecentCheck(service.id);
          
          // Get uptime percentage
          const uptimePercentage = await UptimeRecordModel.calculateUptimePercentage(service.id, 30);

          // Count incidents in last 24 hours (simplified)
          const incidents24h = 0; // This would need incident data integration

          summaries.push({
            serviceId: service.id,
            serviceName: service.name,
            currentStatus,
            uptimePercentage: parseFloat(uptimePercentage),
            lastCheck: recentCheck?.check_time || null,
            totalChecks24h: stats24h.totalChecks,
            successfulChecks24h: stats24h.successfulChecks,
            avgResponseTime24h: stats24h.avgResponseTime,
            incidents24h,
          });
        } catch (serviceError) {
          console.error(`Error getting summary for service ${service.id}:`, serviceError);
          // Add service with default/error values
          summaries.push({
            serviceId: service.id,
            serviceName: service.name,
            currentStatus: 'operational',
            uptimePercentage: 0,
            lastCheck: null,
            totalChecks24h: 0,
            successfulChecks24h: 0,
            avgResponseTime24h: 0,
            incidents24h: 0,
          });
        }
      }

      return summaries;
    } catch (error) {
      console.error('Error getting all services uptime summary:', error);
      throw new Error('Failed to retrieve services uptime summary');
    }
  }

  async getUptimeForDateRange(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DayStatus[]> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      // Validate date range
      if (startDate >= endDate) {
        throw new Error('Start date must be before end date');
      }

      const dayStatuses: DayStatus[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dayData = await UptimeRecordModel.findByDate(serviceId, currentDate);
        
        if (dayData) {
          dayStatuses.push({
            date: currentDate.toISOString().split('T')[0],
            status: dayData.status,
            uptime: this.calculateDayUptime(dayData.status),
            incidents: 0, // Would need incident integration
            avgResponseTime: dayData.response_time || undefined,
          });
        } else {
          // No data for this day
          dayStatuses.push({
            date: currentDate.toISOString().split('T')[0],
            status: 'nd',
            uptime: 0,
            incidents: 0,
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return dayStatuses;
    } catch (error: any) {
      console.error(`Error getting uptime for date range:`, error);
      throw new Error(error.message || 'Failed to retrieve uptime data for date range');
    }
  }

  async getSLACompliance(
    serviceId: string,
    targetUptime: number = 99.9,
    days: number = 30
  ): Promise<{
    isCompliant: boolean;
    currentUptime: number;
    targetUptime: number;
    uptimeDifference: number;
    downtimeMinutes: number;
    allowedDowntimeMinutes: number;
    breachDuration: number;
  }> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      // Get current uptime percentage
      const currentUptimeStr = await UptimeRecordModel.calculateUptimePercentage(serviceId, days);
      const currentUptime = parseFloat(currentUptimeStr);

      // Calculate allowed downtime
      const totalMinutes = days * 24 * 60;
      const allowedDowntimeMinutes = totalMinutes * (100 - targetUptime) / 100;
      
      // Get actual downtime
      const uptimeStats = await WatchServerLogModel.getHealthStats(serviceId, days * 24);
      const downtimeMinutes = uptimeStats.failedChecks; // Assuming 1-minute intervals

      const uptimeDifference = currentUptime - targetUptime;
      const isCompliant = currentUptime >= targetUptime;
      const breachDuration = Math.max(0, downtimeMinutes - allowedDowntimeMinutes);

      return {
        isCompliant,
        currentUptime,
        targetUptime,
        uptimeDifference,
        downtimeMinutes,
        allowedDowntimeMinutes,
        breachDuration,
      };
    } catch (error: any) {
      console.error(`Error calculating SLA compliance for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to calculate SLA compliance');
    }
  }

  async getUptimeTrends(
    serviceId: string,
    days: number = 30
  ): Promise<{
    trend: 'improving' | 'declining' | 'stable';
    trendPercentage: number;
    weeklyAverages: number[];
    dailyUptimes: Array<{
      date: string;
      uptime: number;
    }>;
  }> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Get daily uptime data
      const dailyData = await this.getUptimeForDateRange(serviceId, startDate, endDate);
      
      // Calculate weekly averages
      const weeklyAverages: number[] = [];
      const weeksCount = Math.ceil(days / 7);
      
      for (let week = 0; week < weeksCount; week++) {
        const weekStart = week * 7;
        const weekEnd = Math.min((week + 1) * 7, dailyData.length);
        const weekData = dailyData.slice(weekStart, weekEnd);
        const weekAverage = weekData.reduce((sum, day) => sum + day.uptime, 0) / weekData.length;
        weeklyAverages.push(parseFloat(weekAverage.toFixed(2)));
      }

      // Determine trend
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      let trendPercentage = 0;

      if (weeklyAverages.length >= 2) {
        const firstHalfAvg = weeklyAverages.slice(0, Math.ceil(weeklyAverages.length / 2))
          .reduce((sum, avg) => sum + avg, 0) / Math.ceil(weeklyAverages.length / 2);
        
        const secondHalfAvg = weeklyAverages.slice(Math.floor(weeklyAverages.length / 2))
          .reduce((sum, avg) => sum + avg, 0) / Math.ceil(weeklyAverages.length / 2);

        trendPercentage = secondHalfAvg - firstHalfAvg;

        if (trendPercentage > 0.5) {
          trend = 'improving';
        } else if (trendPercentage < -0.5) {
          trend = 'declining';
        }
      }

      return {
        trend,
        trendPercentage: parseFloat(trendPercentage.toFixed(2)),
        weeklyAverages,
        dailyUptimes: dailyData.map(day => ({
          date: day.date,
          uptime: day.uptime,
        })),
      };
    } catch (error: any) {
      console.error(`Error calculating uptime trends for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to calculate uptime trends');
    }
  }

  async generateUptimeReport(
    serviceIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<{
    reportGenerated: string;
    period: { start: string; end: string };
    services: Array<{
      serviceId: string;
      serviceName: string;
      overallUptime: number;
      totalDowntime: number;
      slaCompliance: boolean;
      incidents: number;
      avgResponseTime: number;
      worstDay: { date: string; uptime: number };
      bestDay: { date: string; uptime: number };
    }>;
    summary: {
      averageUptime: number;
      totalServices: number;
      compliantServices: number;
      totalIncidents: number;
    };
  }> {
    try {
      // Validate all services exist
      const servicesExist = await ServiceModel.existsAll(serviceIds);
      if (!servicesExist) {
        throw new Error('One or more services do not exist');
      }

      const services = await ServiceModel.findByIds(serviceIds);
      const serviceReports = [];

      let totalUptime = 0;
      let compliantCount = 0;
      let totalIncidents = 0;

      for (const service of services) {
        try {
          // Get uptime data for the period
          const dailyData = await this.getUptimeForDateRange(service.id, startDate, endDate);
          const overallUptime = dailyData.reduce((sum, day) => sum + day.uptime, 0) / dailyData.length;
          
          // Calculate downtime
          const totalMinutes = dailyData.length * 24 * 60;
          const downtimeMinutes = totalMinutes * (100 - overallUptime) / 100;

          // SLA compliance (99.9% default)
          const slaCompliance = overallUptime >= 99.9;
          if (slaCompliance) compliantCount++;

          // Find best and worst days
          const sortedDays = [...dailyData].sort((a, b) => a.uptime - b.uptime);
          const worstDay = sortedDays[0];
          const bestDay = sortedDays[sortedDays.length - 1];

          // Count incidents (simplified - would need incident integration)
          const incidents = dailyData.filter(day => day.incidents > 0).length;
          totalIncidents += incidents;

          // Calculate average response time
          const responseTimes = dailyData.filter(day => day.avgResponseTime).map(day => day.avgResponseTime!);
          const avgResponseTime = responseTimes.length > 0 
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
            : 0;

          serviceReports.push({
            serviceId: service.id,
            serviceName: service.name,
            overallUptime: parseFloat(overallUptime.toFixed(2)),
            totalDowntime: parseFloat(downtimeMinutes.toFixed(2)),
            slaCompliance,
            incidents,
            avgResponseTime: Math.round(avgResponseTime),
            worstDay: {
              date: worstDay.date,
              uptime: worstDay.uptime,
            },
            bestDay: {
              date: bestDay.date,
              uptime: bestDay.uptime,
            },
          });

          totalUptime += overallUptime;
        } catch (serviceError) {
          console.error(`Error generating report for service ${service.id}:`, serviceError);
          // Add service with error data
          serviceReports.push({
            serviceId: service.id,
            serviceName: service.name,
            overallUptime: 0,
            totalDowntime: 0,
            slaCompliance: false,
            incidents: 0,
            avgResponseTime: 0,
            worstDay: { date: startDate.toISOString().split('T')[0], uptime: 0 },
            bestDay: { date: endDate.toISOString().split('T')[0], uptime: 0 },
          });
        }
      }

      const averageUptime = services.length > 0 ? totalUptime / services.length : 0;

      return {
        reportGenerated: new Date().toISOString(),
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        services: serviceReports,
        summary: {
          averageUptime: parseFloat(averageUptime.toFixed(2)),
          totalServices: services.length,
          compliantServices: compliantCount,
          totalIncidents,
        },
      };
    } catch (error: any) {
      console.error('Error generating uptime report:', error);
      throw new Error(error.message || 'Failed to generate uptime report');
    }
  }

  private calculateDayUptime(status: 'o' | 'po' | 'mo' | 'nd' | 'e'): number {
    switch (status) {
      case 'o': return 100;      // Operational
      case 'po': return 75;      // Partial outage
      case 'mo': return 25;      // Major outage
      case 'nd': return 0;       // No data
      case 'e': return 0;        // Empty
      default: return 0;
    }
  }

  async getAllServicesUptimeHistory(months: number = 6): Promise<Array<{
    serviceId: string;
    serviceName: string;
    months: Array<{
      name: string;
      year: number;
      uptimePercentage: string;
      dailyStatus: ('o' | 'po' | 'mo' | 'nd' | 'e')[];
    }>;
  }>> {
    try {
      // Get all services
      const services = await ServiceModel.findAll();
      const allServicesHistory = [];

      for (const service of services) {
        try {
          const serviceHistory = await this.getServiceUptimeHistory(service.id, months);
          allServicesHistory.push(serviceHistory);
        } catch (serviceError) {
          console.error(`Error getting uptime history for service ${service.id}:`, serviceError);
          // Add service with fallback data
          allServicesHistory.push({
            serviceId: service.id,
            serviceName: service.name,
            months: this.generateFallbackMonthsData(months),
          });
        }
      }

      return allServicesHistory;
    } catch (error: any) {
      console.error('Error getting all services uptime history:', error);
      throw new Error(error.message || 'Failed to retrieve all services uptime history');
    }
  }

  async getServiceUptimeHistory(serviceId: string, months: number = 6): Promise<{
    serviceId: string;
    serviceName: string;
    months: Array<{
      name: string;
      year: number;
      uptimePercentage: string;
      dailyStatus: ('o' | 'po' | 'mo' | 'nd' | 'e')[];
    }>;
  }> {
    try {
      // Validate service exists
      const service = await ServiceModel.findById(serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Validate months parameter
      if (months < 1 || months > 24) {
        throw new Error('Months parameter must be between 1 and 24');
      }

      // Get monthly uptime data from the model
      const monthsData = await UptimeRecordModel.getMonthlyStats(serviceId, months);

      // Transform data to match frontend expectations
      const transformedMonths = monthsData.map(monthData => ({
        name: `${this.getMonthName(monthData.month)} ${monthData.year}`,
        year: monthData.year,
        uptimePercentage: monthData.uptime,
        dailyStatus: monthData.days,
      }));

      return {
        serviceId: service.id,
        serviceName: service.name,
        months: transformedMonths,
      };
    } catch (error: any) {
      console.error(`Error getting uptime history for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to retrieve service uptime history');
    }
  }

  private getMonthName(monthNumber: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNumber - 1] || 'Unknown';
  }

  private generateFallbackMonthsData(months: number): Array<{
    name: string;
    year: number;
    uptimePercentage: string;
    dailyStatus: ('o' | 'po' | 'mo' | 'nd' | 'e')[];
  }> {
    const fallbackData = [];
    const currentDate = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const dailyStatus: ('o' | 'po' | 'mo' | 'nd' | 'e')[] = Array(daysInMonth).fill('nd');

      fallbackData.unshift({
        name: `${this.getMonthName(date.getMonth() + 1)} ${date.getFullYear()}`,
        year: date.getFullYear(),
        uptimePercentage: '0.00%',
        dailyStatus,
      });
    }

    return fallbackData;
  }

  async cleanupOldUptimeData(days: number = 366): Promise<number> {
    try {
      const deletedCount = await UptimeRecordModel.deleteOldRecords(days);
      console.log(`Cleaned up ${deletedCount} old uptime records (older than ${days} days)`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old uptime data:', error);
      throw new Error('Failed to cleanup old uptime data');
    }
  }
}

export default new UptimeService();