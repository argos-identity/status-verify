'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { mutate } from 'swr';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
  emit: (event: string, data?: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler?: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

    // Create socket connection
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('🔗 Connected to WebSocket server');
      setIsConnected(true);
      setConnectionError(null);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from WebSocket server:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('🚫 Connection error:', error);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setConnectionError(null);
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('🔄❌ Reconnection failed:', error);
      setConnectionError('Reconnection failed');
    });

    // System status real-time events
    newSocket.on('status:update', (data) => {
      console.log('📊 Received status update:', data);
      // Invalidate and refetch system status data
      mutate('system-status');
      mutate('services');
    });

    newSocket.on('incident:new', (data) => {
      console.log('🚨 New incident:', data);
      // Invalidate incident data
      mutate('incidents');
      mutate('system-status');
    });

    newSocket.on('incident:update', (data) => {
      console.log('📝 Incident updated:', data);
      // Invalidate incident data
      mutate('incidents');
      mutate('system-status');
    });

    newSocket.on('service:status', (data) => {
      console.log('⚡ Service status changed:', data);
      // Invalidate service-specific data
      mutate('services');
      mutate('system-status');
    });

    // Health check events
    newSocket.on('health:check', (data) => {
      console.log('💓 Health check received:', data);
      // Optionally update specific service data
      if (data.serviceId) {
        mutate(`service-${data.serviceId}`);
      }
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      newSocket.off();
      newSocket.disconnect();
    };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    } else {
      console.warn('Cannot emit: Socket not connected');
    }
  }, [socket, isConnected]);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    if (socket) {
      socket.on(event, handler);
    }
  }, [socket]);

  const off = useCallback((event: string, handler?: (...args: any[]) => void) => {
    if (socket) {
      if (handler) {
        socket.off(event, handler);
      } else {
        socket.off(event);
      }
    }
  }, [socket]);

  const value: SocketContextType = {
    socket,
    isConnected,
    connectionError,
    emit,
    on,
    off,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use socket context
export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Hook for connection status
export const useSocketConnection = () => {
  const { isConnected, connectionError } = useSocket();
  return { isConnected, connectionError };
};

// Hook for emitting events
export const useSocketEmit = () => {
  const { emit } = useSocket();
  return emit;
};

export default SocketContext;