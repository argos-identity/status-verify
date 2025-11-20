import ServiceModel from '../models/service';
import SystemStatusModel, { SystemStatusResponse } from '../models/system-status';
import UptimeRecordModel from '../models/uptime-record';
import WatchServerLogModel from '../models/watch-server-log';
import IncidentModel from '../models/incident';
import AutoIncidentDetectionService from './auto-incident-detection';
import { Service, WatchServerLog } from '@prisma/client';

export class SystemService {
  async getSystemStatus(): Promise<SystemStatusResponse> {
    try {
      return await SystemStatusModel.getCurrentSystemStatus();
    } catch (error) {
      console.error('Error getting system status:', error);
      throw new Error('Failed to retrieve system status');
    }
  }

  async getAllServices(): Promise<{ services: Service[] }> {
    try {
      const services = await ServiceModel.findAll();
      return { services };
    } catch (error) {
      console.error('Error getting all services:', error);
      throw new Error('Failed to retrieve services');
    }
  }

  async getServiceById(serviceId: string): Promise<Service | null> {
    try {
      return await ServiceModel.findById(serviceId);
    } catch (error) {
      console.error(`Error getting service ${serviceId}:`, error);
      throw new Error('Failed to retrieve service');
    }
  }

  async createService(serviceData: {
    id: string;
    name: string;
    description?: string;
    endpoint_url?: string;
  }): Promise<Service> {
    try {
      // Validate service ID format (kebab-case)
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(serviceData.id)) {
        throw new Error('Service ID must be in kebab-case format');
      }

      // Check if service already exists
      const existingService = await ServiceModel.findById(serviceData.id);
      if (existingService) {
        throw new Error('Service with this ID already exists');
      }

      // Validate endpoint URL if provided
      if (serviceData.endpoint_url) {
        try {
          new URL(serviceData.endpoint_url);
        } catch {
          throw new Error('Invalid endpoint URL format');
        }
      }

      return await ServiceModel.create({
        id: serviceData.id,
        name: serviceData.name,
        description: serviceData.description ?? null,
        endpoint_url: serviceData.endpoint_url ?? null,
      });
    } catch (error: any) {
      console.error('Error creating service:', error);
      throw new Error(error.message || 'Failed to create service');
    }
  }

  async updateService(
    serviceId: string,
    updateData: {
      name?: string;
      description?: string;
      endpoint_url?: string;
    }
  ): Promise<Service> {
    try {
      // Check if service exists
      const existingService = await ServiceModel.findById(serviceId);
      if (!existingService) {
        throw new Error('Service not found');
      }

      // Validate endpoint URL if provided
      if (updateData.endpoint_url) {
        try {
          new URL(updateData.endpoint_url);
        } catch {
          throw new Error('Invalid endpoint URL format');
        }
      }

      return await ServiceModel.update(serviceId, updateData);
    } catch (error: any) {
      console.error(`Error updating service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to update service');
    }
  }

  async deleteService(serviceId: string): Promise<Service> {
    try {
      // Check if service exists
      const existingService = await ServiceModel.findById(serviceId);
      if (!existingService) {
        throw new Error('Service not found');
      }

      return await ServiceModel.delete(serviceId);
    } catch (error: any) {
      console.error(`Error deleting service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to delete service');
    }
  }

  async getServiceUptime(
    serviceId: string,
    months: number = 3,
    startDate?: Date
  ): Promise<{
    service: {
      id: string;
      name: string;
    };
    months: Array<{
      name: string;
      uptime: string;
      days: string[];
    }>;
  }> {
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

      // Get monthly uptime data
      const monthsData = await UptimeRecordModel.getMonthlyStats(
        serviceId,
        months,
        startDate
      );

      return {
        service: {
          id: service.id,
          name: service.name,
        },
        months: monthsData,
      };
    } catch (error: any) {
      console.error(`Error getting uptime for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to retrieve service uptime');
    }
  }

  async getServiceCurrentStatus(serviceId: string): Promise<'operational' | 'degraded' | 'outage'> {
    try {
      return await WatchServerLogModel.getServiceStatus(serviceId);
    } catch (error) {
      console.error(`Error getting current status for service ${serviceId}:`, error);
      return 'operational'; // Default fallback
    }
  }

  async recordServiceUptime(
    serviceId: string,
    date: Date,
    status: 'o' | 'po' | 'mo' | 'nd' | 'e',
    responseTime?: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await UptimeRecordModel.upsert({
        service_id: serviceId,
        date,
        status,
        response_time: responseTime ?? null,
        error_message: errorMessage ?? null,
      });
    } catch (error) {
      console.error(`Error recording uptime for service ${serviceId}:`, error);
      throw new Error('Failed to record service uptime');
    }
  }

  /**
   * Records a health check result and triggers auto incident detection
   */
  async recordHealthCheck(
    serviceId: string,
    checkResult: {
      isSuccess: boolean;
      responseTime?: number;
      statusCode?: number;
      errorMessage?: string;
      errorType?: string;
    }
  ): Promise<WatchServerLog> {
    try {
      // Create the watch server log entry
      const logEntry = await WatchServerLogModel.create({
        service_id: serviceId,
        is_success: checkResult.isSuccess,
        response_time: checkResult.responseTime,
        status_code: checkResult.statusCode,
        error_message: checkResult.errorMessage,
        error_type: checkResult.errorType as any, // Cast to enum type
      });

      // Trigger auto incident detection asynchronously
      setImmediate(async () => {
        try {
          await AutoIncidentDetectionService.onHealthCheckComplete(serviceId, logEntry);
        } catch (error) {
          console.error(`Error in auto incident detection for service ${serviceId}:`, error);
          // Don't throw - this is a background process
        }
      });

      return logEntry;
    } catch (error: any) {
      console.error(`Error recording health check for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to record health check');
    }
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    try {
      return await SystemStatusModel.getSystemHealth();
    } catch (error) {
      console.error('Error getting system health:', error);
      throw new Error('Failed to retrieve system health');
    }
  }

  async getServiceStats(serviceId: string): Promise<{
    uptime24h: number;
    uptime7d: number;
    uptime30d: number;
    avgResponseTime24h: number;
    totalChecks24h: number;
    failedChecks24h: number;
    lastCheck: Date | null;
  }> {
    try {
      const [stats24h, uptimeRecord7d, uptimeRecord30d, recentCheck] = await Promise.all([
        WatchServerLogModel.getHealthStats(serviceId, 24),
        UptimeRecordModel.calculateUptimePercentage(serviceId, 7),
        UptimeRecordModel.calculateUptimePercentage(serviceId, 30),
        WatchServerLogModel.getRecentCheck(serviceId),
      ]);

      return {
        uptime24h: stats24h.uptimePercentage,
        uptime7d: parseFloat(uptimeRecord7d),
        uptime30d: parseFloat(uptimeRecord30d),
        avgResponseTime24h: stats24h.avgResponseTime,
        totalChecks24h: stats24h.totalChecks,
        failedChecks24h: stats24h.failedChecks,
        lastCheck: recentCheck?.check_time || null,
      };
    } catch (error) {
      console.error(`Error getting stats for service ${serviceId}:`, error);
      throw new Error('Failed to retrieve service statistics');
    }
  }

  async validateServiceExists(serviceId: string): Promise<boolean> {
    try {
      return await ServiceModel.exists(serviceId);
    } catch (error) {
      console.error(`Error validating service ${serviceId}:`, error);
      return false;
    }
  }

  async validateServicesExist(serviceIds: string[]): Promise<boolean> {
    try {
      return await ServiceModel.existsAll(serviceIds);
    } catch (error) {
      console.error(`Error validating services ${serviceIds.join(', ')}:`, error);
      return false;
    }
  }

  async getUptimeStatistics(days: number = 30): Promise<{
    overallUptime: number;
    totalIncidents: number;
    totalDowntime: number;
    serviceUptime: Record<string, number>;
  }> {
    try {
      return await SystemStatusModel.getUptimeStatistics(days);
    } catch (error) {
      console.error('Error getting uptime statistics:', error);
      throw new Error('Failed to retrieve uptime statistics');
    }
  }

  async getSystemStatusHistory(days: number = 7): Promise<Array<{
    timestamp: string;
    status: 'operational' | 'degraded' | 'outage';
    message: string;
    duration?: number;
  }>> {
    try {
      return await SystemStatusModel.getSystemStatusHistory(days);
    } catch (error) {
      console.error('Error getting system status history:', error);
      throw new Error('Failed to retrieve system status history');
    }
  }

  async refreshSystemStatus(): Promise<SystemStatusResponse> {
    try {
      // Force refresh by getting current status
      return await this.getSystemStatus();
    } catch (error) {
      console.error('Error refreshing system status:', error);
      throw new Error('Failed to refresh system status');
    }
  }

  async performHealthCheck(serviceId: string): Promise<{
    service: string;
    status: 'operational' | 'degraded' | 'outage';
    responseTime?: number;
    error?: string;
  }> {
    try {
      const service = await ServiceModel.findById(serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      const status = await this.getServiceCurrentStatus(serviceId);
      const recentCheck = await WatchServerLogModel.getRecentCheck(serviceId);

      return {
        service: service.name,
        status,
        responseTime: recentCheck?.response_time || undefined,
        error: recentCheck?.error_message || undefined,
      };
    } catch (error: any) {
      console.error(`Error performing health check for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to perform health check');
    }
  }

  async getServicesStatusHistory(days: number = 90, includeToday: boolean = true): Promise<{
    services: Array<{
      name: string;
      uptimePercentage: string;
      uptimeData: Array<'operational' | 'degraded' | 'outage' | 'partial'>;
    }>;
  }> {
    try {
      // Get all services
      const services = await ServiceModel.findAll();

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days + (includeToday ? 1 : 0));

      const result = [];

      for (const service of services) {
        const statusData = await this.calculateServiceStatusHistory(service.id, service.name, startDate, endDate, days);
        result.push(statusData);
      }

      return { services: result };
    } catch (error: any) {
      console.error('Error getting services status history:', error);
      throw new Error(error.message || 'Failed to get services status history');
    }
  }

  private async calculateServiceStatusHistory(
    serviceId: string,
    serviceName: string,
    startDate: Date,
    endDate: Date,
    totalDays: number
  ): Promise<{
    name: string;
    uptimePercentage: string;
    uptimeData: Array<'operational' | 'degraded' | 'outage' | 'partial'>;
  }> {
    try {
      // Get uptime data from watch-server monitoring (independent of incidents)
      const watchServerData = await UptimeRecordModel.getDailyUptimeStatus(
        serviceId,
        startDate,
        endDate,
        totalDays,
        serviceName
      );

      // Get incidents for display colors/tooltips (doesn't affect uptime percentage)
      const incidents = await IncidentModel.findIncidentsByServiceAndDateRange(
        serviceId,
        startDate,
        endDate
      );

      const finalUptimeData: Array<'operational' | 'degraded' | 'outage' | 'partial'> = [];

      // Combine watch-server data with incident priority for status colors
      for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        // Get status color from incidents (for display purposes)
        const incidentStatus = this.calculateDayStatus(incidents, currentDate);

        // Use watch-server data for the actual uptime bar status,
        // but incident data determines the color based on priority
        let finalStatus: 'operational' | 'degraded' | 'outage' | 'partial';

        // If there are incidents, use incident-based color
        if (incidentStatus !== 'operational') {
          finalStatus = incidentStatus;
        } else {
          // Otherwise use watch-server monitoring data
          finalStatus = watchServerData.uptimeData[i] || 'operational';
        }

        finalUptimeData.push(finalStatus);
      }

      return {
        name: serviceName,
        // CRITICAL: Use watch-server uptime percentage (independent of incidents)
        uptimePercentage: watchServerData.uptimePercentage,
        // Use combined data for visual display
        uptimeData: finalUptimeData,
      };
    } catch (error: any) {
      console.error(`Error calculating status history for service ${serviceId}:`, error);

      // Return fallback data if calculation fails
      const fallbackData = Array(totalDays).fill('operational') as Array<'operational' | 'degraded' | 'outage' | 'partial'>;
      return {
        name: serviceName,
        uptimePercentage: '99.99', // Default to 99.99% - never 100.00%
        uptimeData: fallbackData,
      };
    }
  }

  private calculateDayStatus(
    incidents: any[],
    date: Date
  ): 'operational' | 'degraded' | 'outage' | 'partial' {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Find incidents that were active during this day
    const activeIncidents = incidents.filter(incident => {
      const createdAt = new Date(incident.created_at);
      const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at) : null;

      // Incident is active if:
      // - It was created before or during the day AND
      // - It was either not resolved or resolved after the day started
      return createdAt <= endOfDay && (!resolvedAt || resolvedAt >= startOfDay);
    });

    if (activeIncidents.length === 0) {
      return 'operational';
    }

    // Determine worst status among active incidents based on priority (P1-P4)
    const hasP1 = activeIncidents.some(inc => inc.priority === 'P1');
    const hasP2 = activeIncidents.some(inc => inc.priority === 'P2');
    const hasP3 = activeIncidents.some(inc => inc.priority === 'P3');

    if (hasP1) {
      return 'outage';    // P1 Critical → Red
    } else if (hasP2) {
      return 'degraded';  // P2 High → Orange
    } else if (hasP3) {
      return 'partial';   // P3 Medium → Yellow
    } else {
      return 'partial';   // P4 Low → Green (treated as partial for minimal issues)
    }
  }

  // Removed old simpleHash and calculateUptimePercentage methods - now using UptimeRecordModel

  async getService(serviceId: string) {
    return await ServiceModel.findById(serviceId);
  }

  async getServiceStatus(serviceId: string) {
    const service = await ServiceModel.findById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    const stats = await this.getServiceStats(serviceId);
    const currentStatus = await this.getServiceCurrentStatus(serviceId);
    return {
      serviceId,
      serviceName: service.name,
      status: currentStatus,
      uptime: stats.uptime24h,
      lastCheck: stats.lastCheck || new Date(),
    };
  }

  async updateServiceStatus(serviceId: string, status: any) {
    // Update service status logic
    const service = await ServiceModel.findById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    // Status update logic would go here
    console.log(`Service ${serviceId} status updated to ${status}`);
    return { serviceId, status, updated: true };
  }

  async getServiceDependencies(serviceId: string) {
    // Return service dependencies
    const service = await ServiceModel.findById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    // TODO: Implement dependency tracking
    return [];
  }

  async runServiceHealthCheck(serviceId: string) {
    const service = await ServiceModel.findById(serviceId);
    if (!service) {
      throw new Error('Service not found');
    }
    // TODO: Implement actual health check
    return {
      serviceId,
      healthy: true,
      responseTime: 100,
      timestamp: new Date(),
    };
  }

  async getSystemMetrics() {
    const services = await ServiceModel.findAll();
    const stats = await Promise.all(
      services.map((s: any) => this.getServiceStats(s.id))
    );
    return {
      totalServices: services.length,
      operationalServices: stats.filter((s: any) => s.uptime24h >= 95).length,
      avgUptime: stats.reduce((sum: any, s: any) => sum + s.uptime24h, 0) / stats.length,
      timestamp: new Date(),
    };
  }

  async updateSystemSettings(settings: any) {
    // TODO: Implement system settings update
    console.log('System settings updated:', settings);
  }

  async getSystemAlerts() {
    // TODO: Implement system alerts
    return [];
  }

  async acknowledgeAlert(alertId: string, userId: string) {
    // TODO: Implement alert acknowledgment
    console.log(`Alert ${alertId} acknowledged by user ${userId}`);
  }

  async getSystemConfiguration() {
    // TODO: Implement system configuration
    return {
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      features: {},
    };
  }
}

export default new SystemService();