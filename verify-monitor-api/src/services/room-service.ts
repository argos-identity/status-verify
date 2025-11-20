import { Server as SocketIOServer } from 'socket.io';
import AuthService from './auth-service';
import IncidentService from './incident-service';
import LoggingMiddleware from '../middleware/logging-middleware';

export interface Room {
  id: string;
  type: 'incident' | 'service' | 'system';
  name: string;
  description?: string;
  participants: Map<string, ParticipantInfo>;
  metadata: RoomMetadata;
  createdAt: Date;
  lastActivity: Date;
  settings: RoomSettings;
}

export interface ParticipantInfo {
  userId: string;
  socketId: string;
  name: string;
  role: 'viewer' | 'reporter' | 'admin';
  joinedAt: Date;
  status: 'active' | 'away' | 'busy';
  permissions: string[];
  lastSeen: Date;
}

export interface RoomMetadata {
  incidentId?: string;
  serviceId?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  createdBy: string;
}

export interface RoomSettings {
  maxParticipants: number;
  isPrivate: boolean;
  allowedRoles: ('viewer' | 'reporter' | 'admin')[];
  requiredPermissions: string[];
  autoCleanupAfterMinutes: number;
  enableTypingIndicators: boolean;
  enablePresenceIndicators: boolean;
}

export interface TypingIndicator {
  userId: string;
  startTime: Date;
  isTyping: boolean;
}

export interface RoomActivity {
  type: 'join' | 'leave' | 'message' | 'status_change' | 'typing';
  userId: string;
  timestamp: Date;
  data?: any;
}

export class RoomService {
  private io: SocketIOServer;
  private rooms: Map<string, Room> = new Map();
  private typingIndicators: Map<string, Map<string, TypingIndicator>> = new Map(); // roomId -> userId -> typing info
  private roomActivities: Map<string, RoomActivity[]> = new Map(); // roomId -> activities
  private cleanupInterval!: NodeJS.Timeout;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.startCleanupProcess();
  }

  // Room creation and management
  async createIncidentRoom(
    incidentId: string,
    creatorId: string,
    options?: Partial<RoomSettings>
  ): Promise<Room> {
    try {
      // Verify incident exists
      const incident = await IncidentService.getIncident(incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      // Verify creator permissions
      const hasPermission = await AuthService.hasPermission(creatorId, 'read_incidents');
      if (!hasPermission) {
        throw new Error('Insufficient permissions to create incident room');
      }

      const roomId = `incident:${incidentId}`;
      
      if (this.rooms.has(roomId)) {
        return this.rooms.get(roomId)!;
      }

      const creator = await AuthService.getUserProfile(creatorId);
      
      const room: Room = {
        id: roomId,
        type: 'incident',
        name: `Incident: ${incident.title}`,
        description: `Collaboration room for incident ${incident.title}`,
        participants: new Map(),
        metadata: {
          incidentId,
          priority: incident.severity === 'critical' ? 'critical' : 
                   incident.severity === 'high' ? 'high' :
                   incident.severity === 'medium' ? 'medium' : 'low',
          tags: ['incident', incident.severity],
          createdBy: creatorId,
        },
        createdAt: new Date(),
        lastActivity: new Date(),
        settings: {
          maxParticipants: 50,
          isPrivate: false,
          allowedRoles: ['viewer', 'reporter', 'admin'],
          requiredPermissions: ['read_incidents'],
          autoCleanupAfterMinutes: 60, // 1 hour after last activity
          enableTypingIndicators: true,
          enablePresenceIndicators: true,
          ...options,
        },
      };

      this.rooms.set(roomId, room);
      this.typingIndicators.set(roomId, new Map());
      this.roomActivities.set(roomId, []);

      this.logRoomActivity(roomId, 'join', creatorId, {
        action: 'room_created',
        incidentTitle: incident.title,
      });

      console.log(`Created incident room: ${roomId}`);
      return room;
    } catch (error: any) {
      console.error('Error creating incident room:', error);
      throw error;
    }
  }

  async createServiceRoom(
    serviceId: string,
    creatorId: string,
    options?: Partial<RoomSettings>
  ): Promise<Room> {
    try {
      // Verify service exists
      const serviceExists = await AuthService.hasPermission(creatorId, 'read_services');
      if (!serviceExists) {
        throw new Error('Insufficient permissions to create service room');
      }

      const roomId = `service:${serviceId}`;
      
      if (this.rooms.has(roomId)) {
        return this.rooms.get(roomId)!;
      }

      const room: Room = {
        id: roomId,
        type: 'service',
        name: `Service: ${serviceId}`,
        description: `Monitoring room for service ${serviceId}`,
        participants: new Map(),
        metadata: {
          serviceId,
          priority: 'medium',
          tags: ['service', 'monitoring'],
          createdBy: creatorId,
        },
        createdAt: new Date(),
        lastActivity: new Date(),
        settings: {
          maxParticipants: 20,
          isPrivate: false,
          allowedRoles: ['viewer', 'reporter', 'admin'],
          requiredPermissions: ['read_services'],
          autoCleanupAfterMinutes: 30,
          enableTypingIndicators: false,
          enablePresenceIndicators: true,
          ...options,
        },
      };

      this.rooms.set(roomId, room);
      this.typingIndicators.set(roomId, new Map());
      this.roomActivities.set(roomId, []);

      this.logRoomActivity(roomId, 'join', creatorId, {
        action: 'room_created',
        serviceId,
      });

      console.log(`Created service room: ${roomId}`);
      return room;
    } catch (error: any) {
      console.error('Error creating service room:', error);
      throw error;
    }
  }

  // Participant management
  async addParticipant(
    roomId: string,
    userId: string,
    socketId: string
  ): Promise<ParticipantInfo> {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Check if room is at capacity
      if (room.participants.size >= room.settings.maxParticipants) {
        throw new Error('Room is at maximum capacity');
      }

      // Verify user permissions
      const user = await AuthService.getUserProfile(userId);
      const hasRequiredRole = room.settings.allowedRoles.includes(user.role);
      
      if (!hasRequiredRole) {
        throw new Error(`Role ${user.role} is not allowed in this room`);
      }

      // Check required permissions
      for (const permission of room.settings.requiredPermissions) {
        const hasPermission = await AuthService.hasPermission(userId, permission);
        if (!hasPermission) {
          throw new Error(`Missing required permission: ${permission}`);
        }
      }

      // Create participant info
      const participant: ParticipantInfo = {
        userId,
        socketId,
        name: user.name,
        role: user.role,
        joinedAt: new Date(),
        status: 'active',
        permissions: await AuthService.getUserProfile(userId).then(u => u.permissions),
        lastSeen: new Date(),
      };

      // Add to room
      room.participants.set(userId, participant);
      room.lastActivity = new Date();

      // Log activity
      this.logRoomActivity(roomId, 'join', userId, {
        participantCount: room.participants.size,
      });

      // Notify other participants
      this.io.to(roomId).emit('user_joined_room', {
        roomId,
        user: {
          userId: participant.userId,
          name: participant.name,
          role: participant.role,
          joinedAt: participant.joinedAt.toISOString(),
        },
        participantCount: room.participants.size,
        timestamp: new Date().toISOString(),
      });

      console.log(`User ${userId} joined room ${roomId}`);
      return participant;
    } catch (error: any) {
      console.error('Error adding participant to room:', error);
      throw error;
    }
  }

  async removeParticipant(roomId: string, userId: string): Promise<void> {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        return; // Room doesn't exist, nothing to do
      }

      const participant = room.participants.get(userId);
      if (!participant) {
        return; // User not in room
      }

      // Remove from room
      room.participants.delete(userId);
      room.lastActivity = new Date();

      // Remove typing indicator
      const roomTyping = this.typingIndicators.get(roomId);
      if (roomTyping) {
        roomTyping.delete(userId);
      }

      // Log activity
      this.logRoomActivity(roomId, 'leave', userId, {
        participantCount: room.participants.size,
      });

      // Notify other participants
      this.io.to(roomId).emit('user_left_room', {
        roomId,
        userId,
        userName: participant.name,
        participantCount: room.participants.size,
        timestamp: new Date().toISOString(),
      });

      console.log(`User ${userId} left room ${roomId}`);

      // Auto-cleanup empty rooms if configured
      if (room.participants.size === 0 && room.settings.autoCleanupAfterMinutes > 0) {
        setTimeout(() => {
          this.cleanupEmptyRoom(roomId);
        }, room.settings.autoCleanupAfterMinutes * 60 * 1000);
      }
    } catch (error: any) {
      console.error('Error removing participant from room:', error);
    }
  }

  // Typing indicators
  setTypingIndicator(roomId: string, userId: string, isTyping: boolean): void {
    try {
      const room = this.rooms.get(roomId);
      if (!room || !room.settings.enableTypingIndicators) {
        return;
      }

      const participant = room.participants.get(userId);
      if (!participant) {
        return; // User not in room
      }

      const roomTyping = this.typingIndicators.get(roomId);
      if (!roomTyping) {
        return;
      }

      if (isTyping) {
        roomTyping.set(userId, {
          userId,
          startTime: new Date(),
          isTyping: true,
        });
      } else {
        roomTyping.delete(userId);
      }

      // Broadcast to other participants
      this.io.to(roomId).emit('typing_indicator', {
        roomId,
        userId,
        userName: participant.name,
        isTyping,
        timestamp: new Date().toISOString(),
      });

      // Auto-clear typing indicator after 3 seconds
      if (isTyping) {
        setTimeout(() => {
          const currentTyping = roomTyping.get(userId);
          if (currentTyping && currentTyping.isTyping) {
            this.setTypingIndicator(roomId, userId, false);
          }
        }, 3000);
      }
    } catch (error: any) {
      console.error('Error setting typing indicator:', error);
    }
  }

  // Presence updates
  updatePresence(roomId: string, userId: string, status: 'active' | 'away' | 'busy'): void {
    try {
      const room = this.rooms.get(roomId);
      if (!room || !room.settings.enablePresenceIndicators) {
        return;
      }

      const participant = room.participants.get(userId);
      if (!participant) {
        return;
      }

      participant.status = status;
      participant.lastSeen = new Date();
      room.lastActivity = new Date();

      // Broadcast to other participants
      this.io.to(roomId).emit('presence_update', {
        roomId,
        userId,
        userName: participant.name,
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error updating presence:', error);
    }
  }

  // Room information and statistics
  getRoomInfo(roomId: string): Room | null {
    return this.rooms.get(roomId) || null;
  }

  getRoomParticipants(roomId: string): ParticipantInfo[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.participants.values()) : [];
  }

  getActiveTypingUsers(roomId: string): string[] {
    const roomTyping = this.typingIndicators.get(roomId);
    if (!roomTyping) return [];

    return Array.from(roomTyping.values())
      .filter(indicator => indicator.isTyping)
      .map(indicator => indicator.userId);
  }

  getRoomActivities(roomId: string, limit: number = 50): RoomActivity[] {
    const activities = this.roomActivities.get(roomId) || [];
    return activities.slice(-limit);
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getRoomsByType(type: 'incident' | 'service' | 'system'): Room[] {
    return Array.from(this.rooms.values()).filter(room => room.type === type);
  }

  getUserRooms(userId: string): Room[] {
    return Array.from(this.rooms.values()).filter(room => 
      room.participants.has(userId)
    );
  }

  getRoomStats(): {
    totalRooms: number;
    activeRooms: number;
    totalParticipants: number;
    roomsByType: Record<string, number>;
    averageParticipantsPerRoom: number;
  } {
    const rooms = Array.from(this.rooms.values());
    const activeRooms = rooms.filter(room => room.participants.size > 0);
    const totalParticipants = rooms.reduce((sum, room) => sum + room.participants.size, 0);
    
    const roomsByType = rooms.reduce((acc, room) => {
      acc[room.type] = (acc[room.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRooms: rooms.length,
      activeRooms: activeRooms.length,
      totalParticipants,
      roomsByType,
      averageParticipantsPerRoom: rooms.length > 0 ? totalParticipants / rooms.length : 0,
    };
  }

  // Private helper methods
  private logRoomActivity(roomId: string, type: RoomActivity['type'], userId: string, data?: any): void {
    const activities = this.roomActivities.get(roomId);
    if (activities) {
      activities.push({
        type,
        userId,
        timestamp: new Date(),
        data,
      });

      // Keep only last 100 activities per room
      if (activities.length > 100) {
        activities.splice(0, activities.length - 100);
      }
    }
  }

  private cleanupEmptyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room && room.participants.size === 0) {
      this.rooms.delete(roomId);
      this.typingIndicators.delete(roomId);
      this.roomActivities.delete(roomId);
      console.log(`Cleaned up empty room: ${roomId}`);
    }
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  private performCleanup(): void {
    const now = new Date();
    
    this.rooms.forEach((room, roomId) => {
      const inactiveThreshold = room.settings.autoCleanupAfterMinutes * 60 * 1000;
      const timeSinceLastActivity = now.getTime() - room.lastActivity.getTime();
      
      // Clean up inactive empty rooms
      if (room.participants.size === 0 && timeSinceLastActivity > inactiveThreshold) {
        this.cleanupEmptyRoom(roomId);
        return;
      }

      // Update participant last seen times and remove disconnected users
      room.participants.forEach((participant, userId) => {
        // This would ideally check if the socket is still connected
        // For now, we'll rely on the disconnect handlers to clean up participants
      });

      // Clean up old typing indicators
      const roomTyping = this.typingIndicators.get(roomId);
      if (roomTyping) {
        roomTyping.forEach((indicator, userId) => {
          if (now.getTime() - indicator.startTime.getTime() > 10000) { // 10 seconds
            roomTyping.delete(userId);
          }
        });
      }
    });
  }

  // Cleanup on service shutdown
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.rooms.clear();
    this.typingIndicators.clear();
    this.roomActivities.clear();
    
    console.log('Room service destroyed');
  }
}

export default RoomService;