import IncidentService from '../services/incident-service';
import SystemService from '../services/system-service';
import UptimeService from '../services/uptime-service';
import AuthService from '../services/auth-service';
import LoggingMiddleware from '../middleware/logging-middleware';
import SocketConfig, { AuthenticatedSocket } from '../config/socket-config';

export interface IncidentCollaborationData {
  incidentId: string;
  action: 'comment' | 'status_change' | 'assignment' | 'update';
  data: any;
  userId: string;
  timestamp: Date;
}

export interface SystemUpdateData {
  type: 'status' | 'service' | 'uptime' | 'sla';
  serviceId?: string;
  data: any;
  timestamp: Date;
}

export class WebSocketController {
  private socketConfig: SocketConfig;
  private logger = LoggingMiddleware.websocketLogger();

  constructor(socketConfig: SocketConfig) {
    this.socketConfig = socketConfig;
  }

  // Incident collaboration handlers
  async handleIncidentComment(
    socket: AuthenticatedSocket,
    data: {
      incidentId: string;
      message: string;
      isPublic?: boolean;
      status?: 'investigating' | 'identified' | 'monitoring' | 'resolved';
    }
  ): Promise<void> {
    try {
      // Verify user has permission to comment
      if (!socket.userPermissions?.includes('comment_incidents')) {
        socket.emit('error', {
          message: 'Insufficient permissions to comment on incidents',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      // Add incident comment through service
      const comment = await IncidentService.addIncidentUpdate(data.incidentId, {
        description: data.message,
        user_id: socket.userId!,
        status: data.status,
      });

      // Broadcast to all participants in the incident room
      this.socketConfig.broadcastIncidentComment(data.incidentId, {
        id: comment.id,
        message: comment.description,
        userId: socket.userId,
        status: comment.status,
        isPublic: true,
        createdAt: comment.created_at,
      });

      // Log the event
      this.logger.logEvent(socket.id, 'incident_comment', socket.userId, {
        incidentId: data.incidentId,
        messageLength: data.message.length,
        isPublic: data.isPublic,
      });

      // Send confirmation to the sender
      socket.emit('comment_added', {
        incidentId: data.incidentId,
        commentId: comment.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'COMMENT_FAILED',
      });
    }
  }

  async handleIncidentStatusChange(
    socket: AuthenticatedSocket,
    data: {
      incidentId: string;
      newStatus: 'investigating' | 'identified' | 'monitoring' | 'resolved';
      message?: string;
    }
  ): Promise<void> {
    try {
      // Verify user has permission to manage incidents
      if (!socket.userPermissions?.includes('manage_incidents') && 
          !socket.userPermissions?.includes('update_own_incidents')) {
        socket.emit('error', {
          message: 'Insufficient permissions to change incident status',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      // Update incident status
      const incident = await IncidentService.updateIncident(
        data.incidentId,
        { status: data.newStatus },
        socket.userId!
      );

      // Add status change comment if message provided
      if (data.message) {
        await IncidentService.addIncidentUpdate(data.incidentId, {
          description: data.message,
          user_id: socket.userId!,
          status: data.newStatus,
        });
      }

      // Broadcast status change to all participants
      this.socketConfig.broadcastIncidentUpdate(data.incidentId, {
        type: 'status_change',
        incidentId: data.incidentId,
        newStatus: data.newStatus,
        userId: socket.userId,
        message: data.message,
        timestamp: new Date().toISOString(),
      });

      // Notify all users with incident permissions about status change
      this.socketConfig.notifyUsersWithPermission('read_incidents', 'incident_status_changed', {
        incidentId: data.incidentId,
        newStatus: data.newStatus,
        title: incident.title,
        severity: incident.severity,
      });

      this.logger.logEvent(socket.id, 'incident_status_change', socket.userId, {
        incidentId: data.incidentId,
        newStatus: data.newStatus,
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'STATUS_CHANGE_FAILED',
      });
    }
  }

  async handleIncidentAssignment(
    socket: AuthenticatedSocket,
    data: {
      incidentId: string;
      assigneeId: string;
      message?: string;
    }
  ): Promise<void> {
    try {
      // Verify user has permission to manage incidents
      if (!socket.userPermissions?.includes('manage_incidents')) {
        socket.emit('error', {
          message: 'Insufficient permissions to assign incidents',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      // Verify assignee exists
      const assigneeProfile = await AuthService.getUserProfile(data.assigneeId);
      
      // Add assignment comment
      const comment = await IncidentService.addIncidentUpdate(data.incidentId, {
        description: data.message || `Incident assigned to ${assigneeProfile.name}`,
        user_id: socket.userId!,
      });

      // Broadcast assignment to all participants
      this.socketConfig.broadcastIncidentUpdate(data.incidentId, {
        type: 'assignment',
        incidentId: data.incidentId,
        assigneeId: data.assigneeId,
        assigneeName: assigneeProfile.name,
        assignedBy: socket.userId,
        message: data.message,
        timestamp: new Date().toISOString(),
      });

      // Notify the assignee
      this.socketConfig.notifyUser(data.assigneeId, 'incident_assigned', {
        incidentId: data.incidentId,
        assignedBy: socket.userId,
        message: data.message,
      });

      this.logger.logEvent(socket.id, 'incident_assignment', socket.userId, {
        incidentId: data.incidentId,
        assigneeId: data.assigneeId,
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'ASSIGNMENT_FAILED',
      });
    }
  }

  // System monitoring handlers
  async handleSubscribeToSystemUpdates(
    socket: AuthenticatedSocket,
    data: {
      types?: ('status' | 'service' | 'uptime' | 'sla')[];
      serviceIds?: string[];
    }
  ): Promise<void> {
    try {
      // Verify user has permission to read system status
      if (!socket.userPermissions?.includes('read_system_status')) {
        socket.emit('error', {
          message: 'Insufficient permissions to subscribe to system updates',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      // Join system monitoring rooms based on subscription preferences
      const subscriptionTypes = data.types || ['status', 'service', 'uptime'];
      const serviceIds = data.serviceIds || [];

      for (const type of subscriptionTypes) {
        await socket.join(`system:${type}`);
      }

      // Subscribe to specific service updates if requested
      for (const serviceId of serviceIds) {
        await socket.join(`service:${serviceId}`);
      }

      // Send current system status
      const systemStatus = await SystemService.getSystemStatus();
      socket.emit('system_status_snapshot', {
        status: systemStatus,
        subscriptions: {
          types: subscriptionTypes,
          serviceIds,
        },
        timestamp: new Date().toISOString(),
      });

      this.logger.logEvent(socket.id, 'subscribe_system_updates', socket.userId, {
        types: subscriptionTypes,
        serviceIds,
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'SUBSCRIPTION_FAILED',
      });
    }
  }

  async handleUnsubscribeFromSystemUpdates(
    socket: AuthenticatedSocket,
    data: {
      types?: ('status' | 'service' | 'uptime' | 'sla')[];
      serviceIds?: string[];
    }
  ): Promise<void> {
    try {
      const unsubscribeTypes = data.types || ['status', 'service', 'uptime'];
      const serviceIds = data.serviceIds || [];

      // Leave system monitoring rooms
      for (const type of unsubscribeTypes) {
        await socket.leave(`system:${type}`);
      }

      // Unsubscribe from specific service updates
      for (const serviceId of serviceIds) {
        await socket.leave(`service:${serviceId}`);
      }

      socket.emit('unsubscribed', {
        types: unsubscribeTypes,
        serviceIds,
        timestamp: new Date().toISOString(),
      });

      this.logger.logEvent(socket.id, 'unsubscribe_system_updates', socket.userId, {
        types: unsubscribeTypes,
        serviceIds,
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'UNSUBSCRIPTION_FAILED',
      });
    }
  }

  // Presence and collaboration handlers
  async handleUserPresenceUpdate(
    socket: AuthenticatedSocket,
    data: {
      status: 'online' | 'away' | 'busy' | 'offline';
      message?: string;
    }
  ): Promise<void> {
    try {
      // Broadcast presence update to all rooms user is in
      const rooms = await socket.rooms;
      
      rooms.forEach(room => {
        if (room !== socket.id) { // Don't broadcast to self
          socket.to(room).emit('user_presence_update', {
            userId: socket.userId,
            status: data.status,
            message: data.message,
            timestamp: new Date().toISOString(),
          });
        }
      });

      socket.emit('presence_updated', {
        status: data.status,
        timestamp: new Date().toISOString(),
      });

      this.logger.logEvent(socket.id, 'presence_update', socket.userId, {
        status: data.status,
        message: data.message,
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'PRESENCE_UPDATE_FAILED',
      });
    }
  }

  async handleRequestRoomParticipants(
    socket: AuthenticatedSocket,
    data: { incidentId: string }
  ): Promise<void> {
    try {
      const roomInfo = this.socketConfig.getRoomInfo(data.incidentId);
      
      if (!roomInfo) {
        socket.emit('error', {
          message: 'Room not found',
          code: 'ROOM_NOT_FOUND',
        });
        return;
      }

      // Get participant details
      const participants = [];
      for (const userId of roomInfo.participants) {
        try {
          const userProfile = await AuthService.getUserProfile(userId);
          participants.push({
            userId,
            name: userProfile.name,
            role: userProfile.role,
          });
        } catch {
          // Skip users that can't be found
        }
      }

      socket.emit('room_participants', {
        incidentId: data.incidentId,
        participants,
        totalCount: participants.length,
        timestamp: new Date().toISOString(),
      });

      this.logger.logEvent(socket.id, 'request_room_participants', socket.userId, {
        incidentId: data.incidentId,
        participantCount: participants.length,
      });
    } catch (error: any) {
      this.logger.logError(socket.id, error, socket.userId);
      socket.emit('error', {
        message: error.message,
        code: 'PARTICIPANTS_REQUEST_FAILED',
      });
    }
  }

  // System update broadcasters (called from external services)
  broadcastSystemStatusUpdate(statusUpdate: any): void {
    this.socketConfig.getSocketIOServer().to('system:status').emit('system_status_update', {
      ...statusUpdate,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastServiceUpdate(serviceId: string, serviceUpdate: any): void {
    // Broadcast to service-specific room
    this.socketConfig.getSocketIOServer().to(`service:${serviceId}`).emit('service_update', {
      serviceId,
      ...serviceUpdate,
      timestamp: new Date().toISOString(),
    });

    // Also broadcast to general service updates room
    this.socketConfig.getSocketIOServer().to('system:service').emit('service_update', {
      serviceId,
      ...serviceUpdate,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastUptimeUpdate(serviceId: string, uptimeUpdate: any): void {
    this.socketConfig.getSocketIOServer().to(`service:${serviceId}`).emit('uptime_update', {
      serviceId,
      ...uptimeUpdate,
      timestamp: new Date().toISOString(),
    });

    this.socketConfig.getSocketIOServer().to('system:uptime').emit('uptime_update', {
      serviceId,
      ...uptimeUpdate,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastSLAAlert(serviceId: string, alert: any): void {
    // Send SLA alerts to admins and reporters
    this.socketConfig.notifyUsersWithPermission('manage_services', 'sla_alert', {
      serviceId,
      alert,
    });

    // Also send to SLA monitoring room
    this.socketConfig.getSocketIOServer().to('system:sla').emit('sla_alert', {
      serviceId,
      alert,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastNewIncident(incident: any): void {
    // Notify all users who can read incidents
    this.socketConfig.notifyUsersWithPermission('read_incidents', 'new_incident', {
      incident: {
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        affectedServices: incident.affected_services,
        createdAt: incident.created_at,
      },
    });
  }

  // Connection statistics and monitoring
  getConnectionStats() {
    return this.socketConfig.getConnectionStats();
  }

  // Health check for WebSocket server
  getHealthStatus() {
    const stats = this.socketConfig.getConnectionStats();
    return {
      status: 'healthy',
      connectedUsers: stats.connectedUsers,
      activeRooms: stats.activeRooms,
      totalConnections: stats.totalConnections,
      timestamp: new Date().toISOString(),
    };
  }
}

export default WebSocketController;