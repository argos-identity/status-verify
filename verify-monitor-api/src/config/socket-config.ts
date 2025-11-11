import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import AuthService from '../services/auth-service';
import LoggingMiddleware from '../middleware/logging-middleware';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: 'viewer' | 'reporter' | 'admin';
  userPermissions?: string[];
}

export interface RoomData {
  incidentId: string;
  participants: Set<string>;
  createdAt: Date;
  lastActivity: Date;
  metadata?: any;
}

export class SocketConfig {
  private io: SocketIOServer;
  private rooms: Map<string, RoomData> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketUsers: Map<string, string> = new Map(); // socketId -> userId

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startRoomCleanup();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const tokenPayload = await AuthService.verifyToken(token);
        
        // Attach user info to socket
        socket.userId = tokenPayload.userId;
        socket.userRole = tokenPayload.role;
        socket.userPermissions = tokenPayload.permissions;

        // Log connection attempt
        LoggingMiddleware.websocketLogger().logConnection(socket.id, socket.userId);

        next();
      } catch (error: any) {
        LoggingMiddleware.websocketLogger().logError(socket.id, error);
        next(new Error('Authentication failed: ' + error.message));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const userId = (socket as AuthenticatedSocket).userId;
      if (userId) {
        const userSocketCount = this.userSockets.get(userId)?.size || 0;
        if (userSocketCount >= 5) { // Max 5 connections per user
          return next(new Error('Too many connections for this user'));
        }
      }
      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);

      // Track user socket connections
      if (socket.userId) {
        if (!this.userSockets.has(socket.userId)) {
          this.userSockets.set(socket.userId, new Set());
        }
        this.userSockets.get(socket.userId)!.add(socket.id);
        this.socketUsers.set(socket.id, socket.userId);
      }

      // Send initial connection confirmation
      socket.emit('connection_confirmed', {
        socketId: socket.id,
        userId: socket.userId,
        timestamp: new Date().toISOString(),
        serverVersion: process.env.npm_package_version || '1.0.0',
      });

      // Handle joining incident rooms
      socket.on('join_incident', async (data: { incidentId: string }) => {
        try {
          if (!socket.userId || !socket.userPermissions?.includes('read_incidents')) {
            socket.emit('error', { message: 'Insufficient permissions to join incident room' });
            return;
          }

          await this.joinIncidentRoom(socket, data.incidentId);
        } catch (error: any) {
          LoggingMiddleware.websocketLogger().logError(socket.id, error, socket.userId);
          socket.emit('error', { message: error.message });
        }
      });

      // Handle leaving incident rooms
      socket.on('leave_incident', async (data: { incidentId: string }) => {
        try {
          await this.leaveIncidentRoom(socket, data.incidentId);
        } catch (error: any) {
          LoggingMiddleware.websocketLogger().logError(socket.id, error, socket.userId);
          socket.emit('error', { message: error.message });
        }
      });

      // Handle incident collaboration events
      socket.on('incident_typing', (data: { incidentId: string; isTyping: boolean }) => {
        if (socket.userPermissions?.includes('comment_incidents')) {
          socket.to(`incident:${data.incidentId}`).emit('user_typing', {
            userId: socket.userId,
            incidentId: data.incidentId,
            isTyping: data.isTyping,
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Handle cursor position sharing
      socket.on('cursor_position', (data: { incidentId: string; position: any }) => {
        if (socket.userPermissions?.includes('comment_incidents')) {
          socket.to(`incident:${data.incidentId}`).emit('cursor_update', {
            userId: socket.userId,
            incidentId: data.incidentId,
            position: data.position,
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Handle presence updates
      socket.on('update_presence', (data: { status: 'active' | 'away' | 'busy' }) => {
        if (socket.userId) {
          // Broadcast presence to all user's rooms
          const userRooms = this.getUserRooms(socket.userId);
          userRooms.forEach(roomName => {
            socket.to(roomName).emit('presence_update', {
              userId: socket.userId,
              status: data.status,
              timestamp: new Date().toISOString(),
            });
          });
        }
      });

      // Handle heartbeat/ping
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        LoggingMiddleware.websocketLogger().logDisconnection(socket.id, socket.userId, reason);
        this.handleDisconnect(socket, reason);
      });

      // Handle errors
      socket.on('error', (error) => {
        LoggingMiddleware.websocketLogger().logError(socket.id, error, socket.userId);
      });
    });
  }

  // Room management methods
  private async joinIncidentRoom(socket: AuthenticatedSocket, incidentId: string): Promise<void> {
    const roomName = `incident:${incidentId}`;
    
    // Join the room
    await socket.join(roomName);
    
    // Update room data
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, {
        incidentId,
        participants: new Set(),
        createdAt: new Date(),
        lastActivity: new Date(),
      });
    }
    
    const room = this.rooms.get(roomName)!;
    if (socket.userId) {
      room.participants.add(socket.userId);
    }
    room.lastActivity = new Date();

    // Notify other participants
    socket.to(roomName).emit('user_joined', {
      userId: socket.userId,
      incidentId,
      timestamp: new Date().toISOString(),
      participantCount: room.participants.size,
    });

    // Send current participant list to the joining user
    socket.emit('incident_joined', {
      incidentId,
      participants: Array.from(room.participants),
      timestamp: new Date().toISOString(),
    });

    LoggingMiddleware.websocketLogger().logEvent(socket.id, 'join_incident', socket.userId, { incidentId });
  }

  private async leaveIncidentRoom(socket: AuthenticatedSocket, incidentId: string): Promise<void> {
    const roomName = `incident:${incidentId}`;
    
    // Leave the room
    await socket.leave(roomName);
    
    // Update room data
    const room = this.rooms.get(roomName);
    if (room && socket.userId) {
      room.participants.delete(socket.userId);
      room.lastActivity = new Date();
      
      // Notify other participants
      socket.to(roomName).emit('user_left', {
        userId: socket.userId,
        incidentId,
        timestamp: new Date().toISOString(),
        participantCount: room.participants.size,
      });

      // Clean up empty rooms
      if (room.participants.size === 0) {
        this.rooms.delete(roomName);
      }
    }

    LoggingMiddleware.websocketLogger().logEvent(socket.id, 'leave_incident', socket.userId, { incidentId });
  }

  private handleDisconnect(socket: AuthenticatedSocket, reason: string): void {
    if (socket.userId) {
      // Remove from user socket tracking
      const userSockets = this.userSockets.get(socket.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(socket.userId);
        }
      }
      this.socketUsers.delete(socket.id);

      // Remove from all rooms and notify participants
      const userRooms = this.getUserRooms(socket.userId);
      userRooms.forEach(roomName => {
        const room = this.rooms.get(roomName);
        if (room) {
          room.participants.delete(socket.userId!);
          room.lastActivity = new Date();
          
          // Notify remaining participants
          socket.to(roomName).emit('user_left', {
            userId: socket.userId,
            incidentId: room.incidentId,
            timestamp: new Date().toISOString(),
            participantCount: room.participants.size,
            reason: 'disconnected',
          });

          // Clean up empty rooms
          if (room.participants.size === 0) {
            this.rooms.delete(roomName);
          }
        }
      });
    }

    console.log(`Socket ${socket.id} disconnected: ${reason}`);
  }

  // Broadcast methods for external use
  public broadcastIncidentUpdate(incidentId: string, update: any): void {
    const roomName = `incident:${incidentId}`;
    this.io.to(roomName).emit('incident_updated', {
      incidentId,
      update,
      timestamp: new Date().toISOString(),
    });
  }

  public broadcastIncidentComment(incidentId: string, comment: any): void {
    const roomName = `incident:${incidentId}`;
    this.io.to(roomName).emit('incident_comment', {
      incidentId,
      comment,
      timestamp: new Date().toISOString(),
    });
  }

  public broadcastSystemStatusUpdate(status: any): void {
    this.io.emit('system_status_updated', {
      status,
      timestamp: new Date().toISOString(),
    });
  }

  public broadcastServiceStatusUpdate(serviceId: string, status: any): void {
    this.io.emit('service_status_updated', {
      serviceId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  public broadcastNewIncident(incident: any): void {
    this.io.emit('new_incident', {
      incident,
      timestamp: new Date().toISOString(),
    });
  }

  public notifyUser(userId: string, event: string, data: any): void {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit(event, {
          ...data,
          timestamp: new Date().toISOString(),
        });
      });
    }
  }

  public notifyUsersWithPermission(permission: string, event: string, data: any): void {
    this.io.fetchSockets().then(sockets => {
      sockets.forEach(socket => {
        const authSocket = socket as unknown as AuthenticatedSocket;
        if (authSocket.userPermissions?.includes(permission)) {
          socket.emit(event, {
            ...data,
            timestamp: new Date().toISOString(),
          });
        }
      });
    });
  }

  // Utility methods
  private getUserRooms(userId: string): string[] {
    const rooms: string[] = [];
    this.rooms.forEach((roomData, roomName) => {
      if (roomData.participants.has(userId)) {
        rooms.push(roomName);
      }
    });
    return rooms;
  }

  private startRoomCleanup(): void {
    // Clean up inactive rooms every 5 minutes
    setInterval(() => {
      const now = new Date();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

      this.rooms.forEach((room, roomName) => {
        if (now.getTime() - room.lastActivity.getTime() > inactiveThreshold) {
          console.log(`Cleaning up inactive room: ${roomName}`);
          this.rooms.delete(roomName);
        }
      });
    }, 5 * 60 * 1000);
  }

  // Public getters for monitoring
  public getConnectedUsers(): number {
    return this.userSockets.size;
  }

  public getActiveRooms(): number {
    return this.rooms.size;
  }

  public getRoomInfo(incidentId: string): RoomData | null {
    return this.rooms.get(`incident:${incidentId}`) || null;
  }

  public getAllRooms(): Map<string, RoomData> {
    return new Map(this.rooms);
  }

  public getSocketIOServer(): SocketIOServer {
    return this.io;
  }

  public getConnectionStats(): {
    connectedUsers: number;
    activeRooms: number;
    totalConnections: number;
    roomDetails: Array<{
      roomName: string;
      participants: number;
      createdAt: string;
      lastActivity: string;
    }>;
  } {
    return {
      connectedUsers: this.userSockets.size,
      activeRooms: this.rooms.size,
      totalConnections: this.socketUsers.size,
      roomDetails: Array.from(this.rooms.entries()).map(([roomName, room]) => ({
        roomName,
        participants: room.participants.size,
        createdAt: room.createdAt.toISOString(),
        lastActivity: room.lastActivity.toISOString(),
      })),
    };
  }
}

export default SocketConfig;