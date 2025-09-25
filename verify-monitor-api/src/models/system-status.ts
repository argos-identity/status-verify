import { PrismaClient, SystemStatus, SystemHealthStatus } from '@prisma/client';
import ServiceModel from './service';
import WatchServerLogModel from './watch-server-log';

const prisma = new PrismaClient();

export interface SystemStatusResponse {
  overallStatus: 'operational' | 'degraded' | 'outage';
  lastUpdated: string;
  services: Array<{
    id: string;
    name: string;
    status: 'operational' | 'degraded' | 'outage';
    uptime: string;
    uptimeData: string[];
  }>;
}

export class SystemStatusModel {
  static async create(data: {
    overall_status: SystemHealthStatus;
    message?: string;
  }): Promise<SystemStatus> {
    return prisma.systemStatus.create({
      data: {
        overall_status: data.overall_status,
        message: data.message,
      },
    });
  }

  static async getLatest(): Promise<SystemStatus | null> {
    return prisma.systemStatus.findFirst({
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  static async getHistory(limit: number = 10): Promise<SystemStatus[]> {
    return prisma.systemStatus.findMany({
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
    });
  }

  static async getCurrentSystemStatus(): Promise<SystemStatusResponse> {
    // Get all services with their uptime stats
    const servicesWithStats = await ServiceModel.getWithUptimeStats();
    
    if (servicesWithStats.length === 0) {
      return {
        overallStatus: 'operational',
        lastUpdated: new Date().toISOString(),
        services: [],
      };
    }

    // Determine overall system status based on individual service statuses
    let overallStatus: 'operational' | 'degraded' | 'outage' = 'operational';
    
    const serviceStatuses = servicesWithStats.map(service => service.currentStatus!);
    
    if (serviceStatuses.some(status => status === 'outage')) {
      overallStatus = 'outage';
    } else if (serviceStatuses.some(status => status === 'degraded')) {
      overallStatus = 'degraded';
    }

    // Record this status if it's different from the last recorded status
    const latestRecord = await this.getLatest();
    
    if (!latestRecord || latestRecord.overall_status !== overallStatus) {
      await this.create({
        overall_status: overallStatus,
        message: this.getStatusMessage(overallStatus, serviceStatuses),
      });
    }

    return {
      overallStatus,
      lastUpdated: new Date().toISOString(),
      services: servicesWithStats.map(service => ({
        id: service.id,
        name: service.name,
        status: service.currentStatus!,
        uptime: service.uptimePercentage!,
        uptimeData: service.uptimeData!,
      })),
    };
  }

  private static getStatusMessage(
    overallStatus: 'operational' | 'degraded' | 'outage',
    serviceStatuses: ('operational' | 'degraded' | 'outage')[]
  ): string {
    const outageCount = serviceStatuses.filter(status => status === 'outage').length;
    const degradedCount = serviceStatuses.filter(status => status === 'degraded').length;
    const operationalCount = serviceStatuses.filter(status => status === 'operational').length;

    switch (overallStatus) {
      case 'outage':
        if (outageCount === serviceStatuses.length) {
          return '모든 서비스에서 장애가 발생했습니다.';
        } else if (outageCount === 1) {
          return '1개 서비스에서 장애가 발생했습니다.';
        } else {
          return `${outageCount}개 서비스에서 장애가 발생했습니다.`;
        }
      
      case 'degraded':
        if (degradedCount === 1 && outageCount === 0) {
          return '1개 서비스에서 성능 저하가 발생했습니다.';
        } else {
          return `${degradedCount + outageCount}개 서비스에서 문제가 발생했습니다.`;
        }
      
      case 'operational':
      default:
        return '모든 시스템이 정상적으로 작동하고 있습니다.';
    }
  }

  static async getSystemStatusHistory(days: number = 7): Promise<Array<{
    timestamp: string;
    status: 'operational' | 'degraded' | 'outage';
    message: string;
    duration?: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const records = await prisma.systemStatus.findMany({
      where: {
        created_at: {
          gte: startDate,
        },
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return records.map((record, index) => {
      const nextRecord = records[index + 1];
      const duration = nextRecord
        ? nextRecord.created_at.getTime() - record.created_at.getTime()
        : undefined;

      return {
        timestamp: record.created_at.toISOString(),
        status: record.overall_status as 'operational' | 'degraded' | 'outage',
        message: record.message || '',
        duration,
      };
    });
  }

  static async getUptimeStatistics(days: number = 30): Promise<{
    overallUptime: number;
    totalIncidents: number;
    totalDowntime: number; // in minutes
    serviceUptime: Record<string, number>;
  }> {
    const services = await ServiceModel.findAll();
    const serviceUptime: Record<string, number> = {};
    let totalOperationalTime = 0;
    let totalTime = 0;
    let totalDowntime = 0;

    for (const service of services) {
      const stats = await WatchServerLogModel.getHealthStats(service.id, days * 24);
      
      // Calculate uptime percentage
      const uptime = stats.totalChecks > 0 ? stats.uptimePercentage : 100;
      serviceUptime[service.id] = uptime;
      
      // Add to overall calculations
      totalOperationalTime += stats.successfulChecks;
      totalTime += stats.totalChecks;
      
      // Calculate downtime in minutes (assuming 1-minute check intervals)
      const downtimeChecks = stats.failedChecks;
      totalDowntime += downtimeChecks;
    }

    const overallUptime = totalTime > 0 
      ? parseFloat(((totalOperationalTime / totalTime) * 100).toFixed(2))
      : 100;

    // Get incident count for the period
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const incidentCount = await prisma.incident.count({
      where: {
        created_at: {
          gte: startDate,
        },
      },
    });

    return {
      overallUptime,
      totalIncidents: incidentCount,
      totalDowntime,
      serviceUptime,
    };
  }

  static async getAvailabilitySLA(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalChecks: number;
    successfulChecks: number;
    failedChecks: number;
    uptimePercentage: number;
    totalDowntime: string; // formatted string like "3h 58m"
    downtimeMinutes: number;
  }> {
    const stats = await WatchServerLogModel.getHealthStats(
      serviceId,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60))
    );

    const downtimeMinutes = stats.failedChecks; // Assuming 1-minute intervals
    const hours = Math.floor(downtimeMinutes / 60);
    const minutes = downtimeMinutes % 60;
    
    let totalDowntime = '';
    if (hours > 0) {
      totalDowntime += `${hours}h`;
      if (minutes > 0) {
        totalDowntime += ` ${minutes}m`;
      }
    } else if (minutes > 0) {
      totalDowntime = `${minutes}m`;
    } else {
      totalDowntime = '0m';
    }

    return {
      totalChecks: stats.totalChecks,
      successfulChecks: stats.successfulChecks,
      failedChecks: stats.failedChecks,
      uptimePercentage: stats.uptimePercentage,
      totalDowntime,
      downtimeMinutes,
    };
  }

  static async getCurrentIncidents(): Promise<Array<{
    id: string;
    title: string;
    status: string;
    severity: string;
    affectedServices: string[];
    createdAt: string;
  }>> {
    const activeIncidents = await prisma.incident.findMany({
      where: {
        status: {
          in: ['investigating', 'identified', 'monitoring'],
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 5, // Latest 5 active incidents
    });

    return activeIncidents.map(incident => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      affectedServices: incident.affected_services,
      createdAt: incident.created_at.toISOString(),
    }));
  }

  static async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number; // 0-100
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check service availability
    const services = await ServiceModel.findAll();
    let unhealthyServices = 0;

    for (const service of services) {
      const status = await WatchServerLogModel.getServiceStatus(service.id);
      if (status === 'outage') {
        issues.push(`${service.name} is currently down`);
        score -= 20;
        unhealthyServices++;
      } else if (status === 'degraded') {
        issues.push(`${service.name} is experiencing performance issues`);
        score -= 10;
        unhealthyServices++;
      }
    }

    // Check for active incidents
    const activeIncidents = await this.getCurrentIncidents();
    if (activeIncidents.length > 0) {
      issues.push(`${activeIncidents.length} active incident(s)`);
      score -= activeIncidents.length * 5;
    }

    // Check overall uptime
    const uptimeStats = await this.getUptimeStatistics(7); // Last 7 days
    if (uptimeStats.overallUptime < 99.5) {
      issues.push(`Overall uptime is ${uptimeStats.overallUptime}% (below 99.5% target)`);
      score -= 15;
      recommendations.push('Investigate recurring service issues');
    }

    // Add recommendations based on issues
    if (unhealthyServices > 0) {
      recommendations.push('Check service health and resolve underlying issues');
    }

    if (activeIncidents.length > 3) {
      recommendations.push('Review incident response process and resource allocation');
    }

    // Determine health status
    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 90) {
      status = 'healthy';
    } else if (score >= 70) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }

  static async deleteOldRecords(days: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const result = await prisma.systemStatus.deleteMany({
      where: {
        created_at: {
          lt: cutoffDate,
        },
      },
    });
    
    return result.count;
  }
}

export default SystemStatusModel;