import ServiceModel from '../models/service';
import UptimeRecordModel from '../models/uptime-record';
import WatchServerLogModel from '../models/watch-server-log';
import APIResponseTimeModel from '../models/api-response-time';
import APICallLogModel from '../models/api-call-log';
import IncidentModel from '../models/incident';
import SystemStatusModel from '../models/system-status';

export interface SLATarget {
  uptime: number; // percentage (e.g., 99.9)
  responseTime: number; // milliseconds (e.g., 200)
  errorRate: number; // percentage (e.g., 0.1)
}

export interface SLAMetrics {
  serviceId: string;
  serviceName: string;
  period: {
    start: Date;
    end: Date;
    days: number;
  };
  uptime: {
    target: number;
    actual: number;
    compliance: boolean;
    breach: {
      minutes: number;
      percentage: number;
    };
  };
  responseTime: {
    target: number;
    actual: number;
    compliance: boolean;
    p95: number;
    p99: number;
  };
  errorRate: {
    target: number;
    actual: number;
    compliance: boolean;
    totalRequests: number;
    errorRequests: number;
  };
  overallCompliance: boolean;
  slaScore: number; // 0-100
}

export interface SLAReport {
  reportId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  services: SLAMetrics[];
  summary: {
    totalServices: number;
    compliantServices: number;
    averageSLAScore: number;
    topPerformers: string[];
    worstPerformers: string[];
  };
  recommendations: string[];
}

export interface SLAAlert {
  type: 'uptime_breach' | 'response_time_breach' | 'error_rate_breach';
  serviceId: string;
  serviceName: string;
  threshold: number;
  actual: number;
  severity: 'warning' | 'critical';
  timestamp: Date;
  message: string;
}

export class SLAService {
  private readonly DEFAULT_SLA_TARGETS: SLATarget = {
    uptime: 99.9,      // 99.9%
    responseTime: 200, // 200ms
    errorRate: 0.1,    // 0.1%
  };

  async calculateSLAMetrics(
    serviceId: string,
    startDate: Date,
    endDate: Date,
    targets?: SLATarget
  ): Promise<SLAMetrics> {
    try {
      // Validate service exists
      const service = await ServiceModel.findById(serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Use provided targets or defaults
      const slaTargets = targets || this.DEFAULT_SLA_TARGETS;
      
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Calculate uptime metrics
      const uptimeMetrics = await this.calculateUptimeMetrics(
        serviceId, 
        startDate, 
        endDate, 
        slaTargets.uptime
      );

      // Calculate response time metrics
      const responseTimeMetrics = await this.calculateResponseTimeMetrics(
        serviceId, 
        startDate, 
        endDate, 
        slaTargets.responseTime
      );

      // Calculate error rate metrics
      const errorRateMetrics = await this.calculateErrorRateMetrics(
        serviceId, 
        startDate, 
        endDate, 
        slaTargets.errorRate
      );

      // Check overall compliance
      const overallCompliance = 
        uptimeMetrics.compliance && 
        responseTimeMetrics.compliance && 
        errorRateMetrics.compliance;

      // Calculate SLA score (weighted average)
      const slaScore = this.calculateSLAScore(
        uptimeMetrics.actual / uptimeMetrics.target,
        responseTimeMetrics.actual / responseTimeMetrics.target,
        errorRateMetrics.actual / errorRateMetrics.target
      );

      return {
        serviceId,
        serviceName: service.name,
        period: {
          start: startDate,
          end: endDate,
          days,
        },
        uptime: uptimeMetrics,
        responseTime: responseTimeMetrics,
        errorRate: errorRateMetrics,
        overallCompliance,
        slaScore,
      };
    } catch (error: any) {
      console.error(`Error calculating SLA metrics for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to calculate SLA metrics');
    }
  }

  async generateSLAReport(
    serviceIds: string[],
    startDate: Date,
    endDate: Date,
    targets?: SLATarget
  ): Promise<SLAReport> {
    try {
      // Validate all services exist
      const servicesExist = await ServiceModel.existsAll(serviceIds);
      if (!servicesExist) {
        throw new Error('One or more services do not exist');
      }

      const reportId = this.generateReportId();
      const servicesMetrics: SLAMetrics[] = [];

      // Calculate metrics for each service
      for (const serviceId of serviceIds) {
        try {
          const metrics = await this.calculateSLAMetrics(serviceId, startDate, endDate, targets);
          servicesMetrics.push(metrics);
        } catch (serviceError) {
          console.error(`Error calculating metrics for service ${serviceId}:`, serviceError);
          // Continue with other services
        }
      }

      // Calculate summary
      const totalServices = servicesMetrics.length;
      const compliantServices = servicesMetrics.filter(s => s.overallCompliance).length;
      const averageSLAScore = totalServices > 0 
        ? servicesMetrics.reduce((sum, s) => sum + s.slaScore, 0) / totalServices 
        : 0;

      // Identify top and worst performers
      const sortedByScore = [...servicesMetrics].sort((a, b) => b.slaScore - a.slaScore);
      const topPerformers = sortedByScore.slice(0, 3).map(s => s.serviceName);
      const worstPerformers = sortedByScore.slice(-3).map(s => s.serviceName).reverse();

      // Generate recommendations
      const recommendations = this.generateRecommendations(servicesMetrics);

      return {
        reportId,
        generatedAt: new Date(),
        period: {
          start: startDate,
          end: endDate,
        },
        services: servicesMetrics,
        summary: {
          totalServices,
          compliantServices,
          averageSLAScore: parseFloat(averageSLAScore.toFixed(2)),
          topPerformers,
          worstPerformers,
        },
        recommendations,
      };
    } catch (error: any) {
      console.error('Error generating SLA report:', error);
      throw new Error(error.message || 'Failed to generate SLA report');
    }
  }

  async checkSLAAlerts(
    serviceId: string,
    targets?: SLATarget
  ): Promise<SLAAlert[]> {
    try {
      const alerts: SLAAlert[] = [];
      const service = await ServiceModel.findById(serviceId);
      
      if (!service) {
        throw new Error('Service not found');
      }

      const slaTargets = targets || this.DEFAULT_SLA_TARGETS;
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Check uptime alerts (last hour)
      const uptimeStats = await WatchServerLogModel.getHealthStats(serviceId, 1);
      if (uptimeStats.uptimePercentage < slaTargets.uptime) {
        const severity = uptimeStats.uptimePercentage < (slaTargets.uptime - 1) ? 'critical' : 'warning';
        alerts.push({
          type: 'uptime_breach',
          serviceId,
          serviceName: service.name,
          threshold: slaTargets.uptime,
          actual: uptimeStats.uptimePercentage,
          severity,
          timestamp: now,
          message: `Uptime ${uptimeStats.uptimePercentage.toFixed(2)}% below target ${slaTargets.uptime}%`,
        });
      }

      // Check response time alerts (last hour)
      const responseTimeMetrics = await APIResponseTimeModel.getRecentMetrics(serviceId, 1);
      if (responseTimeMetrics.avgResponseTime > slaTargets.responseTime) {
        const severity = responseTimeMetrics.avgResponseTime > (slaTargets.responseTime * 2) ? 'critical' : 'warning';
        alerts.push({
          type: 'response_time_breach',
          serviceId,
          serviceName: service.name,
          threshold: slaTargets.responseTime,
          actual: responseTimeMetrics.avgResponseTime,
          severity,
          timestamp: now,
          message: `Response time ${responseTimeMetrics.avgResponseTime}ms above target ${slaTargets.responseTime}ms`,
        });
      }

      // Check error rate alerts (last hour)
      const callLogs = await APICallLogModel.findByService(serviceId, 1);
      if (callLogs.length > 0) {
        const recentLog = callLogs[0];
        if (recentLog) {
          const errorRate = recentLog.total_calls > 0
            ? (recentLog.error_calls / recentLog.total_calls) * 100
            : 0;
        
          if (errorRate > slaTargets.errorRate) {
            const severity = errorRate > (slaTargets.errorRate * 2) ? 'critical' : 'warning';
            alerts.push({
              type: 'error_rate_breach',
              serviceId,
              serviceName: service.name,
              threshold: slaTargets.errorRate,
              actual: errorRate,
              severity,
              timestamp: now,
              message: `Error rate ${errorRate.toFixed(2)}% above target ${slaTargets.errorRate}%`,
            });
          }
        }
      }

      return alerts;
    } catch (error: any) {
      console.error(`Error checking SLA alerts for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to check SLA alerts');
    }
  }

  async getAllServicesSLAStatus(targets?: SLATarget): Promise<Array<{
    serviceId: string;
    serviceName: string;
    currentCompliance: boolean;
    slaScore: number;
    alerts: SLAAlert[];
    lastUpdated: Date;
  }>> {
    try {
      const services = await ServiceModel.findAll();
      const statuses = [];

      for (const service of services) {
        try {
          // Calculate current SLA metrics (last 24 hours)
          const endDate = new Date();
          const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
          
          const metrics = await this.calculateSLAMetrics(service.id, startDate, endDate, targets);
          const alerts = await this.checkSLAAlerts(service.id, targets);

          statuses.push({
            serviceId: service.id,
            serviceName: service.name,
            currentCompliance: metrics.overallCompliance,
            slaScore: metrics.slaScore,
            alerts,
            lastUpdated: new Date(),
          });
        } catch (serviceError) {
          console.error(`Error getting SLA status for service ${service.id}:`, serviceError);
          statuses.push({
            serviceId: service.id,
            serviceName: service.name,
            currentCompliance: false,
            slaScore: 0,
            alerts: [],
            lastUpdated: new Date(),
          });
        }
      }

      return statuses;
    } catch (error) {
      console.error('Error getting all services SLA status:', error);
      throw new Error('Failed to get services SLA status');
    }
  }

  async calculateMonthlyAvailability(
    serviceId: string,
    year: number,
    month: number
  ): Promise<{
    availability: number;
    totalMinutes: number;
    downtime: number;
    incidents: number;
    mttr: number; // Mean Time To Recovery in minutes
  }> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      // Calculate availability from uptime records
      const uptimeData = await UptimeRecordModel.getMonthlyStats(serviceId, 1, startDate);
      const monthData = uptimeData[0];

      if (!monthData) {
        return {
          availability: 0,
          totalMinutes: 0,
          downtime: 0,
          incidents: 0,
          mttr: 0,
        };
      }

      const availability = parseFloat(monthData.uptime);
      const totalMinutes = endDate.getDate() * 24 * 60;
      const downtime = totalMinutes * (100 - availability) / 100;

      // Get incidents for the month
      // TODO: Implement IncidentModel.findByServiceAndDateRange
      const incidents: any[] = [];
      const resolvedIncidents = incidents.filter((i: any) => i.resolved_at);

      // Calculate MTTR
      let totalResolutionTime = 0;
      resolvedIncidents.forEach((incident: any) => {
        if (incident.resolved_at) {
          totalResolutionTime += incident.resolved_at.getTime() - incident.created_at.getTime();
        }
      });

      const mttr = resolvedIncidents.length > 0 
        ? totalResolutionTime / (resolvedIncidents.length * 60 * 1000) // Convert to minutes
        : 0;

      return {
        availability,
        totalMinutes,
        downtime,
        incidents: incidents.length,
        mttr: Math.round(mttr),
      };
    } catch (error: any) {
      console.error(`Error calculating monthly availability for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to calculate monthly availability');
    }
  }

  private async calculateUptimeMetrics(
    serviceId: string,
    startDate: Date,
    endDate: Date,
    target: number
  ): Promise<{
    target: number;
    actual: number;
    compliance: boolean;
    breach: { minutes: number; percentage: number };
  }> {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const uptimePercentage = await UptimeRecordModel.calculateUptimePercentage(serviceId, days);
    const actual = parseFloat(uptimePercentage);
    
    const totalMinutes = days * 24 * 60;
    const allowedDowntime = totalMinutes * (100 - target) / 100;
    const actualDowntime = totalMinutes * (100 - actual) / 100;
    const breachMinutes = Math.max(0, actualDowntime - allowedDowntime);
    const breachPercentage = (breachMinutes / totalMinutes) * 100;

    return {
      target,
      actual,
      compliance: actual >= target,
      breach: {
        minutes: Math.round(breachMinutes),
        percentage: parseFloat(breachPercentage.toFixed(3)),
      },
    };
  }

  private async calculateResponseTimeMetrics(
    serviceId: string,
    startDate: Date,
    endDate: Date,
    target: number
  ): Promise<{
    target: number;
    actual: number;
    compliance: boolean;
    p95: number;
    p99: number;
  }> {
    const responseTimeMetrics = await APIResponseTimeModel.getMetricsForPeriod(serviceId, startDate, endDate);
    const percentileStats = await APIResponseTimeModel.getPercentileStats(serviceId, startDate, endDate);

    return {
      target,
      actual: responseTimeMetrics.avgResponseTime,
      compliance: responseTimeMetrics.avgResponseTime <= target,
      p95: percentileStats.p95,
      p99: percentileStats.p99,
    };
  }

  private async calculateErrorRateMetrics(
    serviceId: string,
    startDate: Date,
    endDate: Date,
    target: number
  ): Promise<{
    target: number;
    actual: number;
    compliance: boolean;
    totalRequests: number;
    errorRequests: number;
  }> {
    const callLogs = await APICallLogModel.findByServiceAndDateRange(serviceId, startDate, endDate);
    
    const totalRequests = callLogs.reduce((sum, log) => sum + log.total_calls, 0);
    const errorRequests = callLogs.reduce((sum, log) => sum + log.error_calls, 0);
    const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;

    return {
      target,
      actual: parseFloat(errorRate.toFixed(3)),
      compliance: errorRate <= target,
      totalRequests,
      errorRequests,
    };
  }

  private calculateSLAScore(
    uptimeRatio: number,
    responseTimeRatio: number,
    errorRateRatio: number
  ): number {
    // Weighted scoring: uptime 50%, response time 30%, error rate 20%
    const uptimeScore = Math.min(100, uptimeRatio * 100) * 0.5;
    const responseTimeScore = Math.min(100, (2 - Math.min(2, responseTimeRatio)) * 100) * 0.3;
    const errorRateScore = Math.min(100, (2 - Math.min(2, errorRateRatio)) * 100) * 0.2;

    return parseFloat((uptimeScore + responseTimeScore + errorRateScore).toFixed(1));
  }

  private generateRecommendations(services: SLAMetrics[]): string[] {
    const recommendations: string[] = [];

    // Analyze patterns across services
    const nonCompliantServices = services.filter(s => !s.overallCompliance);
    const lowUptimeServices = services.filter(s => s.uptime.actual < s.uptime.target);
    const slowServices = services.filter(s => !s.responseTime.compliance);
    const errorProneServices = services.filter(s => !s.errorRate.compliance);

    if (nonCompliantServices.length > services.length * 0.5) {
      recommendations.push('More than 50% of services are not meeting SLA targets. Consider reviewing infrastructure capacity and monitoring thresholds.');
    }

    if (lowUptimeServices.length > 0) {
      recommendations.push(`${lowUptimeServices.length} service(s) have uptime issues. Review monitoring alerts and implement redundancy for critical services.`);
    }

    if (slowServices.length > 0) {
      recommendations.push(`${slowServices.length} service(s) have response time issues. Consider performance optimization and caching strategies.`);
    }

    if (errorProneServices.length > 0) {
      recommendations.push(`${errorProneServices.length} service(s) have high error rates. Review error handling and implement circuit breakers.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('All services are meeting their SLA targets. Continue monitoring and maintain current performance levels.');
    }

    return recommendations;
  }

  private generateReportId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `sla-report-${timestamp}-${random}`;
  }

  async getResponseTimes(serviceId: string, params: any) {
    // TODO: Implement response time tracking
    return {
      serviceId,
      averageResponseTime: 150,
      p50: 100,
      p95: 250,
      p99: 400,
      samples: [],
    };
  }

  async getAvailability(serviceId: string, params: any) {
    // TODO: Implement availability tracking
    return {
      serviceId,
      availability: 99.9,
      uptime: 99.9,
      downtime: 0.1,
    };
  }

  async getSLACompliance(serviceId: string, params: any) {
    // TODO: Implement SLA compliance calculation
    return {
      serviceId,
      compliant: true,
      score: 99.5,
      violations: [],
    };
  }

  async getAllServicesCompliance(params: any) {
    // TODO: Implement all services compliance
    return {
      overallCompliance: 99.5,
      services: [],
      summary: {},
    };
  }

  async getSLATargets(serviceId: string) {
    // TODO: Implement SLA targets retrieval
    return {
      serviceId,
      uptimeTarget: 99.9,
      responseTimeTarget: 200,
      errorRateTarget: 0.1,
    };
  }

  async updateSLATargets(serviceId: string, targets: any) {
    // TODO: Implement SLA targets update
    console.log(`SLA targets updated for service ${serviceId}:`, targets);
    return targets;
  }

  async getSLAViolations(serviceId: string, params: any) {
    // TODO: Implement SLA violations tracking
    return {
      serviceId,
      violations: [],
      total: 0,
    };
  }

  async acknowledgeSLAViolation(violationId: string, userId: string) {
    // TODO: Implement violation acknowledgment
    console.log(`SLA violation ${violationId} acknowledged by user ${userId}`);
    return { violationId, acknowledgedBy: userId, acknowledgedAt: new Date() };
  }

  async recordResponseTime(serviceId: string, responseTime: number) {
    // TODO: Implement response time recording
    console.log(`Response time recorded for service ${serviceId}: ${responseTime}ms`);
    return { serviceId, responseTime, recordedAt: new Date() };
  }
}

export default new SLAService();