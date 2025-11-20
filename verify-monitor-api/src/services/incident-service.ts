import IncidentModel from '../models/incident';
import IncidentUpdateModel from '../models/incident-update';
import SystemStatusModel from '../models/system-status';
import ServiceModel from '../models/service';
import UserModel from '../models/user';
import { Incident, IncidentUpdate, IncidentStatus, IncidentSeverity, IncidentPriority, User } from '@prisma/client';

export interface CreateIncidentData {
  title: string;
  description: string;
  status?: IncidentStatus;
  severity: IncidentSeverity;
  priority?: IncidentPriority;
  affected_services: string[];
  reporter_id?: string;
  reporter?: string;
}

export interface UpdateIncidentData {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  priority?: IncidentPriority;
  affected_services?: string[];
  status?: IncidentStatus;
}

export interface CreateUpdateData {
  description: string;
  user_id: string;
  status?: IncidentStatus;
}

export interface IncidentWithDetails {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  affected_services: string[];
  reporter: string | null;
  detection_criteria: string | null;
  created_at: Date;
  resolved_at: Date | null;
  updates?: IncidentUpdate[];
  reporter_details?: {
    id: string;
    name: string;
    email: string;
  };
  affected_service_names?: string[];
}

export class IncidentService {
  async createIncident(data: CreateIncidentData, reporter_id: string): Promise<Incident> {
    try {
      // Use the reporter_id from parameter if not provided in data
      const effectiveReporterId = data.reporter_id || reporter_id;

      // Debug logging
      console.log('Creating incident with:', {
        data_reporter_id: data.reporter_id,
        param_reporter_id: reporter_id,
        effectiveReporterId
      });

      if (!effectiveReporterId) {
        throw new Error('Reporter ID is required but not provided');
      }

      // Validate reporter exists
      const reporter = await UserModel.findById(effectiveReporterId);
      if (!reporter) {
        throw new Error('Reporter not found');
      }

      // Check reporter permissions
      if (!await UserModel.hasPermission(effectiveReporterId, 'report_incidents')) {
        throw new Error('User does not have permission to create incidents');
      }

      // Validate all affected services exist
      const servicesExist = await ServiceModel.existsAll(data.affected_services);
      if (!servicesExist) {
        throw new Error('One or more affected services do not exist');
      }

      const incident = await IncidentModel.create({
        title: data.title,
        description: data.description,
        severity: data.severity,
        priority: data.priority,
        affected_services: data.affected_services,
        reporter_id: effectiveReporterId,
        reporter: data.reporter,
        status: data.status || 'investigating',
      });

      // Create initial incident update
      await IncidentUpdateModel.create({
        incident_id: incident.id,
        description: `Incident reported: ${data.title}`,
        user_id: effectiveReporterId,
        status: data.status || 'investigating',
      });

      // Update system status if needed
      await this.updateSystemStatusIfNeeded();

      return incident;
    } catch (error: any) {
      console.error('Error creating incident:', error);
      throw new Error(error.message || 'Failed to create incident');
    }
  }

  async updateIncident(
    incidentId: string,
    updateData: UpdateIncidentData,
    userId: string
  ): Promise<Incident> {
    try {
      // Check if incident exists
      const existingIncident = await IncidentModel.findById(incidentId);
      if (!existingIncident) {
        throw new Error('Incident not found');
      }

      // Check user permissions
      if (!await UserModel.hasPermission(userId, 'manage_incidents')) {
        throw new Error('User does not have permission to manage incidents');
      }

      // Validate status transition if status is being changed
      if (updateData.status && updateData.status !== existingIncident.status) {
        if (!IncidentModel.isValidStatusTransition(existingIncident.status, updateData.status)) {
          throw new Error(`Invalid status transition from ${existingIncident.status} to ${updateData.status}`);
        }
      }

      // Validate affected services if being updated
      if (updateData.affected_services) {
        const servicesExist = await ServiceModel.existsAll(updateData.affected_services);
        if (!servicesExist) {
          throw new Error('One or more affected services do not exist');
        }
      }

      const incident = await IncidentModel.update(incidentId, updateData);

      // Create update log if status changed
      if (updateData.status && updateData.status !== existingIncident.status) {
        const statusMessages = {
          investigating: 'Status changed to Investigating',
          identified: 'Issue has been identified',
          monitoring: 'Fix implemented, monitoring for stability',
          resolved: 'Incident has been resolved',
        };

        await IncidentUpdateModel.create({
          incident_id: incidentId,
          description: statusMessages[updateData.status] || `Status changed to ${updateData.status}`,
          user_id: userId,
          status: updateData.status,
        });
      }

      // Update system status if needed
      await this.updateSystemStatusIfNeeded();

      return incident;
    } catch (error: any) {
      console.error(`Error updating incident ${incidentId}:`, error);
      throw new Error(error.message || 'Failed to update incident');
    }
  }

  async getIncident(incidentId: string): Promise<IncidentWithDetails | null> {
    try {
      const incident = await IncidentModel.findByIdWithDetails(incidentId);
      if (!incident) {
        return null;
      }

      // Get service names for affected services
      const services = await ServiceModel.findByIds(incident.affected_services);
      const serviceNameMap = new Map(services.map(s => [s.id, s.name]));
      
      const affected_service_names = incident.affected_services.map(
        id => serviceNameMap.get(id) || id
      );

      return {
        ...incident,
        affected_service_names,
      };
    } catch (error) {
      console.error(`Error getting incident ${incidentId}:`, error);
      throw new Error('Failed to retrieve incident');
    }
  }

  async getAllIncidents(
    limit: number = 50,
    offset: number = 0,
    status?: IncidentStatus
  ): Promise<{
    incidents: IncidentWithDetails[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const { incidents, total } = await IncidentModel.findManyWithDetails(limit, offset, status);

      // Get all unique service IDs
      const allServiceIds = new Set<string>();
      incidents.forEach(incident => {
        incident.affected_services.forEach(id => allServiceIds.add(id));
      });

      // Fetch all services once
      const services = await ServiceModel.findByIds(Array.from(allServiceIds));
      const serviceNameMap = new Map(services.map(s => [s.id, s.name]));

      // Add service names to each incident
      const incidentsWithServiceNames: IncidentWithDetails[] = incidents.map(incident => ({
        ...incident,
        affected_service_names: incident.affected_services.map(
          id => serviceNameMap.get(id) || id
        ),
      }));

      return {
        incidents: incidentsWithServiceNames,
        total,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      console.error('Error getting incidents:', error);
      throw new Error('Failed to retrieve incidents');
    }
  }

  async addIncidentUpdate(
    incidentId: string,
    updateData: CreateUpdateData
  ): Promise<IncidentUpdate> {
    try {
      // Check if incident exists
      const incident = await IncidentModel.findById(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      // Check user permissions
      if (!await UserModel.hasPermission(updateData.user_id, 'manage_incidents')) {
        throw new Error('User does not have permission to add incident updates');
      }

      // Validate status transition if status is being changed
      if (updateData.status && updateData.status !== incident.status) {
        if (!IncidentModel.isValidStatusTransition(incident.status, updateData.status)) {
          throw new Error(`Invalid status transition from ${incident.status} to ${updateData.status}`);
        }
      }

      // Ensure description has minimum length
      const description = updateData.description && updateData.description.trim().length >= 10
        ? updateData.description
        : `Status updated to ${updateData.status || incident.status}`;

      const update = await IncidentUpdateModel.create({
        incident_id: incidentId,
        description: description,
        user_id: updateData.user_id,
        status: updateData.status || incident.status,
      });

      // Update incident status if provided
      if (updateData.status && updateData.status !== incident.status) {
        await IncidentModel.update(incidentId, { status: updateData.status });
        
        // Update system status if needed
        await this.updateSystemStatusIfNeeded();
      }

      return update;
    } catch (error: any) {
      console.error(`Error adding update to incident ${incidentId}:`, error);
      throw new Error(error.message || 'Failed to add incident update');
    }
  }

  async getIncidentUpdates(
    incidentId: string,
    limit: number = 20
  ): Promise<{
    updates: Array<IncidentUpdate & { user: { id: string; name: string; email: string } }>;
    total: number;
    hasMore: boolean;
  }> {
    try {
      const updates = await IncidentUpdateModel.findByIncident(incidentId);
      const total = updates.length;

      return {
        updates: updates.slice(0, limit) as any,
        total,
        hasMore: total > limit,
      };
    } catch (error) {
      console.error(`Error getting updates for incident ${incidentId}:`, error);
      throw new Error('Failed to retrieve incident updates');
    }
  }

  async deleteIncident(incidentId: string, userId: string): Promise<Incident> {
    try {
      // Check if incident exists
      const incident = await IncidentModel.findById(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      // Check user permissions (admin only)
      const user = await UserModel.findById(userId);
      if (!user || user.role !== 'admin') {
        throw new Error('Only administrators can delete incidents');
      }

      const deletedIncident = await IncidentModel.delete(incidentId);

      // Update system status if needed
      await this.updateSystemStatusIfNeeded();

      return deletedIncident;
    } catch (error: any) {
      console.error(`Error deleting incident ${incidentId}:`, error);
      throw new Error(error.message || 'Failed to delete incident');
    }
  }

  async getActiveIncidents(): Promise<IncidentWithDetails[]> {
    try {
      const { incidents } = await this.getAllIncidents(100, 0);
      
      // Filter for active incidents (not resolved)
      const activeIncidents = incidents.filter(
        incident => incident.status !== 'resolved'
      );

      return activeIncidents;
    } catch (error) {
      console.error('Error getting active incidents:', error);
      throw new Error('Failed to retrieve active incidents');
    }
  }

  async getIncidentsByService(
    serviceId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    incidents: IncidentWithDetails[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      // Validate service exists
      const serviceExists = await ServiceModel.exists(serviceId);
      if (!serviceExists) {
        throw new Error('Service not found');
      }

      const { incidents, total } = await IncidentModel.findByService(serviceId, limit, offset);

      // Get all unique service IDs for service name lookup
      const allServiceIds = new Set<string>();
      incidents.forEach(incident => {
        incident.affected_services.forEach(id => allServiceIds.add(id));
      });

      const services = await ServiceModel.findByIds(Array.from(allServiceIds));
      const serviceNameMap = new Map(services.map(s => [s.id, s.name]));

      const incidentsWithServiceNames: IncidentWithDetails[] = incidents.map(incident => ({
        ...incident,
        affected_service_names: incident.affected_services.map(
          id => serviceNameMap.get(id) || id
        ),
      }));

      return {
        incidents: incidentsWithServiceNames,
        total,
        hasMore: offset + limit < total,
      };
    } catch (error: any) {
      console.error(`Error getting incidents for service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to retrieve service incidents');
    }
  }

  async getIncidentMetrics(days: number = 30): Promise<{
    totalIncidents: number;
    incidentsBySeverity: Record<IncidentSeverity, number>;
    incidentsByStatus: Record<IncidentStatus, number>;
    avgResolutionTime: number; // in hours
    mttr: number; // Mean Time To Resolution in hours
  }> {
    try {
      const metrics = await IncidentModel.getMetrics(days);
      return metrics;
    } catch (error) {
      console.error('Error getting incident metrics:', error);
      throw new Error('Failed to retrieve incident metrics');
    }
  }

  async resolveIncident(
    incidentId: string,
    userId: string,
    resolutionMessage: string
  ): Promise<Incident> {
    try {
      // Check if incident exists and is not already resolved
      const incident = await IncidentModel.findById(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      if (incident.status === 'resolved') {
        throw new Error('Incident is already resolved');
      }

      // Check user permissions
      if (!await UserModel.hasPermission(userId, 'manage_incidents')) {
        throw new Error('User does not have permission to resolve incidents');
      }

      // Update incident to resolved
      const resolvedIncident = await IncidentModel.update(incidentId, { 
        status: 'resolved',
        resolved_at: new Date(),
      });

      // Add resolution update
      await IncidentUpdateModel.create({
        incident_id: incidentId,
        description: `Incident resolved: ${resolutionMessage}`,
        user_id: userId,
        status: 'resolved',
      });

      // Update system status
      await this.updateSystemStatusIfNeeded();

      return resolvedIncident;
    } catch (error: any) {
      console.error(`Error resolving incident ${incidentId}:`, error);
      throw new Error(error.message || 'Failed to resolve incident');
    }
  }

  private async updateSystemStatusIfNeeded(): Promise<void> {
    try {
      // This will trigger system status calculation based on active incidents
      await SystemStatusModel.getCurrentSystemStatus();
    } catch (error) {
      console.error('Error updating system status after incident change:', error);
      // Don't throw - this is a side effect and shouldn't fail the main operation
    }
  }

  async getPastIncidents(options: {
    limit?: number;
    offset?: number;
    severity?: string;
    status?: string;
    serviceId?: string;
    timeRange?: string;
  } = {}): Promise<IncidentWithDetails[]> {
    try {
      const {
        limit = 50,
        offset = 0,
        severity,
        status,
        serviceId,
        timeRange = '90d'
      } = options;

      // Don't default to 'resolved' status - get all incidents unless explicitly filtered
      const statusFilter = status ? status as IncidentStatus : undefined;

      const { incidents } = await this.getAllIncidents(limit, offset, statusFilter);

      // Apply additional filters if provided
      let filteredIncidents = incidents;

      // Filter by severity if provided
      if (severity) {
        filteredIncidents = filteredIncidents.filter(
          incident => incident.severity === severity
        );
      }

      // Filter by service if provided
      if (serviceId) {
        filteredIncidents = filteredIncidents.filter(
          incident => incident.affected_services.includes(serviceId)
        );
      }

      // Filter by time range if provided (basic implementation)
      if (timeRange) {
        const daysAgo = parseInt(timeRange.replace('d', ''), 10);
        if (!isNaN(daysAgo)) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

          filteredIncidents = filteredIncidents.filter(
            incident => new Date(incident.created_at) >= cutoffDate
          );
        }
      }

      return filteredIncidents;
    } catch (error: any) {
      console.error('Error getting past incidents:', error);
      throw new Error(`Failed to retrieve past incidents: ${error.message}`);
    }
  }

  async getIncidentsByDate(date: string, serviceId?: string): Promise<{
    date: string;
    incidents: Array<{
      id: string;
      title: string;
      severity: IncidentSeverity;
      status: IncidentStatus;
      affected_services: string[];
      started_at: Date;
      resolved_at: Date | null;
      major_outage_duration?: number; // in minutes
      partial_outage_duration?: number; // in minutes
      description: string;
    }>;
    summary: {
      total_incidents: number;
      major_outage_minutes: number;
      partial_outage_minutes: number;
      affected_services: string[];
    };
  }> {
    try {
      // Parse the date
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get incidents that were active during this date
      const { incidents: allIncidents } = await this.getAllIncidents(1000, 0);

      // Filter incidents that were active on the target date
      const relevantIncidents = allIncidents.filter(incident => {
        // Use created_at as the start time
        const incidentStart = new Date(incident.created_at);
        const incidentEnd = incident.resolved_at ? new Date(incident.resolved_at) : new Date();

        // Check if incident overlaps with target date
        return incidentStart <= endOfDay && incidentEnd >= startOfDay;
      });

      // Further filter by service if specified
      const filteredIncidents = serviceId
        ? relevantIncidents.filter(incident =>
            incident.affected_services.includes(serviceId)
          )
        : relevantIncidents;

      // Calculate durations and format response
      const formattedIncidents = filteredIncidents.map(incident => {
        // Use created_at as the start time
        const incidentStart = new Date(incident.created_at);
        const incidentEnd = incident.resolved_at ? new Date(incident.resolved_at) : new Date();

        // Calculate overlap with target date
        const overlapStart = new Date(Math.max(incidentStart.getTime(), startOfDay.getTime()));
        const overlapEnd = new Date(Math.min(incidentEnd.getTime(), endOfDay.getTime()));
        const overlapMinutes = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60));

        let majorOutageDuration = 0;
        let partialOutageDuration = 0;

        if (incident.severity === 'high' || incident.severity === 'critical') {
          majorOutageDuration = Math.round(overlapMinutes);
        } else if (incident.severity === 'medium') {
          partialOutageDuration = Math.round(overlapMinutes);
        }

        return {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          affected_services: incident.affected_services,
          started_at: incident.created_at,
          resolved_at: incident.resolved_at,
          major_outage_duration: majorOutageDuration,
          partial_outage_duration: partialOutageDuration,
          description: incident.description || '',
        };
      });

      // Calculate summary
      const totalMajorOutage = formattedIncidents.reduce((sum, inc) => sum + (inc.major_outage_duration || 0), 0);
      const totalPartialOutage = formattedIncidents.reduce((sum, inc) => sum + (inc.partial_outage_duration || 0), 0);
      const affectedServices = [...new Set(formattedIncidents.flatMap(inc => inc.affected_services))];

      return {
        date,
        incidents: formattedIncidents,
        summary: {
          total_incidents: formattedIncidents.length,
          major_outage_minutes: totalMajorOutage,
          partial_outage_minutes: totalPartialOutage,
          affected_services: affectedServices,
        },
      };
    } catch (error: any) {
      console.error(`Error getting incidents for date ${date}:`, error);
      throw new Error(error.message || 'Failed to retrieve incidents by date');
    }
  }

  async validateIncidentData(data: Partial<CreateIncidentData>): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    if (data.title !== undefined) {
      if (!data.title || data.title.trim().length === 0) {
        errors.push('Title is required');
      } else if (data.title.length > 200) {
        errors.push('Title must be 200 characters or less');
      }
    }

    if (data.description !== undefined) {
      if (!data.description || data.description.trim().length === 0) {
        errors.push('Description is required');
      } else if (data.description.length > 2000) {
        errors.push('Description must be 2000 characters or less');
      }
    }

    if (data.severity !== undefined) {
      const validSeverities: IncidentSeverity[] = ['low', 'medium', 'high', 'critical'];
      if (!validSeverities.includes(data.severity)) {
        errors.push('Invalid severity level');
      }
    }

    if (data.affected_services !== undefined) {
      if (!Array.isArray(data.affected_services) || data.affected_services.length === 0) {
        errors.push('At least one affected service is required');
      } else {
        // Validate service IDs format (kebab-case)
        const invalidServiceIds = data.affected_services.filter(
          id => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
        );
        if (invalidServiceIds.length > 0) {
          errors.push(`Invalid service ID format: ${invalidServiceIds.join(', ')}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async assignIncident(
    incidentId: string,
    userId: string,
    assigneeId: string
  ): Promise<Incident> {
    try {
      // Check if incident exists
      const incident = await IncidentModel.findById(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      // Check user permissions
      if (!await UserModel.hasPermission(userId, 'manage_incidents')) {
        throw new Error('User does not have permission to assign incidents');
      }

      // Check if assignee exists
      const assignee = await UserModel.findById(assigneeId);
      if (!assignee) {
        throw new Error('Assignee not found');
      }

      // Update incident with assignee
      const updatedIncident = await IncidentModel.update(incidentId, {
        // TODO: Add assigned_to field to IncidentUpdateData type
      });

      // Add update notification
      await IncidentUpdateModel.create({
        incident_id: incidentId,
        description: `Incident assigned to ${assignee.username}`,
        user_id: userId,
        status: incident.status,
      });

      return updatedIncident;
    } catch (error: any) {
      console.error(`Error assigning incident ${incidentId}:`, error);
      throw new Error(error.message || 'Failed to assign incident');
    }
  }

  async escalateIncident(
    incidentId: string,
    userId: string,
    reason: string
  ): Promise<Incident> {
    try {
      // Check if incident exists
      const incident = await IncidentModel.findById(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      // Check user permissions
      if (!await UserModel.hasPermission(userId, 'manage_incidents')) {
        throw new Error('User does not have permission to escalate incidents');
      }

      // Escalate severity
      const severityHierarchy: Record<IncidentSeverity, IncidentSeverity> = {
        low: 'medium',
        medium: 'high',
        high: 'critical',
        critical: 'critical', // Already max
      };

      const newSeverity = severityHierarchy[incident.severity];

      // Update incident with escalated severity
      const updatedIncident = await IncidentModel.update(incidentId, {
        severity: newSeverity,
        priority: 'P2', // Auto-set priority to high (P2)
      });

      // Add escalation update
      await IncidentUpdateModel.create({
        incident_id: incidentId,
        description: `Incident escalated to ${newSeverity} severity. Reason: ${reason}`,
        user_id: userId,
        status: incident.status,
      });

      // Update system status
      await this.updateSystemStatusIfNeeded();

      return updatedIncident;
    } catch (error: any) {
      console.error(`Error escalating incident ${incidentId}:`, error);
      throw new Error(error.message || 'Failed to escalate incident');
    }
  }
}

export default new IncidentService();