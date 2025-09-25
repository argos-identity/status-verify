import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth-middleware';

export interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode?: number;
  responseTime?: number;
  userId?: string;
  userRole?: string;
  ip: string;
  userAgent?: string;
  requestId: string;
  requestSize?: number;
  responseSize?: number;
  error?: string;
  metadata?: any;
}

export interface SecurityLogEntry {
  timestamp: string;
  event: string;
  userId?: string;
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  success: boolean;
  reason?: string;
  metadata?: any;
}

export interface ExternalAPILogEntry {
  timestamp: string;
  requestId: string;
  serviceName: string;
  method: string;
  url: string;
  headers?: Record<string, any>;
  requestBody?: any;
  httpStatus?: number;
  responseTime?: number;
  responseData?: any;
  error?: string;
  userId?: string;
  success: boolean;
}

export class LoggingMiddleware {
  private static logs: LogEntry[] = [];
  private static securityLogs: SecurityLogEntry[] = [];
  private static externalAPILogs: ExternalAPILogEntry[] = [];
  private static readonly MAX_LOGS = 10000; // Keep last 10k logs in memory

  // Request logging middleware
  static requestLogger() {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Generate or extract request ID
      const requestId = req.headers['x-request-id'] as string || 
                       `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add request ID to headers for downstream use
      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);

      // Get request size
      const requestSize = req.headers['content-length'] ? 
                         parseInt(req.headers['content-length'], 10) : 
                         0;

      // Log request start
      const logEntry: Partial<LogEntry> = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        userId: req.user?.userId,
        userRole: req.user?.role,
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'],
        requestId,
        requestSize,
      };

      // Override res.json to capture response size
      const originalJson = res.json;
      res.json = function(body: any) {
        const responseSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
        logEntry.responseSize = responseSize;
        return originalJson.call(this, body);
      };

      // Log response when finished
      res.on('finish', () => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const completedLog: LogEntry = {
          ...logEntry as LogEntry,
          statusCode: res.statusCode,
          responseTime,
        };

        // Add to logs
        this.addLog(completedLog);

        // Console output based on log level
        this.consoleLog(completedLog);
      });

      next();
    };
  }

  // Security event logger
  static securityLogger() {
    return {
      logAuth: (req: Request, success: boolean, userId?: string, reason?: string) => {
        const securityLog: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          event: 'authentication',
          userId,
          ip: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          path: req.path,
          method: req.method,
          success,
          reason,
          metadata: {
            timestamp: new Date().toISOString(),
          },
        };

        this.addSecurityLog(securityLog);
        this.consoleSecurityLog(securityLog);
      },

      logAuthorization: (req: AuthRequest, success: boolean, requiredPermission?: string, reason?: string) => {
        const securityLog: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          event: 'authorization',
          userId: req.user?.userId,
          ip: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          path: req.path,
          method: req.method,
          success,
          reason,
          metadata: {
            userRole: req.user?.role,
            requiredPermission,
            userPermissions: req.user?.permissions,
          },
        };

        this.addSecurityLog(securityLog);
        this.consoleSecurityLog(securityLog);
      },

      logSuspiciousActivity: (req: Request, activity: string, metadata?: any) => {
        const securityLog: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          event: 'suspicious_activity',
          ip: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          path: req.path,
          method: req.method,
          success: false,
          reason: activity,
          metadata: {
            ...metadata,
            severity: 'high',
          },
        };

        this.addSecurityLog(securityLog);
        this.consoleSecurityLog(securityLog);
      },

      logDataAccess: (req: AuthRequest, resource: string, success: boolean, metadata?: any) => {
        const securityLog: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          event: 'data_access',
          userId: req.user?.userId,
          ip: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'],
          path: req.path,
          method: req.method,
          success,
          metadata: {
            resource,
            userRole: req.user?.role,
            ...metadata,
          },
        };

        this.addSecurityLog(securityLog);
        this.consoleSecurityLog(securityLog);
      },
    };
  }

  // Performance monitoring middleware
  static performanceLogger(threshold: number = 1000) {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        
        if (responseTime > threshold) {
          console.warn('SLOW REQUEST:', {
            method: req.method,
            path: req.path,
            responseTime: `${responseTime}ms`,
            threshold: `${threshold}ms`,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString(),
            userId: (req as AuthRequest).user?.userId,
          });
        }
      });

      next();
    };
  }

  // Error logging middleware
  static errorLogger() {
    return (error: Error, req: AuthRequest, res: Response, next: NextFunction) => {
      const errorLog = {
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        request: {
          method: req.method,
          path: req.path,
          userId: req.user?.userId,
          userRole: req.user?.role,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'],
        },
      };

      console.error('ERROR:', errorLog);

      // Log security-relevant errors
      if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
        this.securityLogger().logAuth(req, false, req.user?.userId, error.message);
      }

      next(error);
    };
  }

  // Health check logging
  static healthCheckLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/health' || req.path === '/api/health') {
        const healthLog = {
          timestamp: new Date().toISOString(),
          type: 'health_check',
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        };

        console.log('HEALTH_CHECK:', healthLog);
      }

      next();
    };
  }

  // API usage analytics
  static analyticsLogger() {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      res.on('finish', () => {
        const analytics = {
          timestamp: new Date().toISOString(),
          endpoint: `${req.method} ${req.path}`,
          userId: req.user?.userId,
          userRole: req.user?.role,
          statusCode: res.statusCode,
          responseTime: res.getHeader('X-Response-Time'),
          ip: req.ip,
          success: res.statusCode < 400,
        };

        // Log API usage for analytics
        if (process.env.LOG_ANALYTICS === 'true') {
          console.log('ANALYTICS:', analytics);
        }
      });

      next();
    };
  }

  // Database query logging (for use with Prisma middleware)
  static databaseLogger() {
    return {
      logQuery: (query: string, duration: number, model?: string, action?: string) => {
        const dbLog = {
          timestamp: new Date().toISOString(),
          type: 'database_query',
          model,
          action,
          duration: `${duration}ms`,
          slow: duration > 100, // Mark queries over 100ms as slow
        };

        if (process.env.LOG_DATABASE === 'true' || dbLog.slow) {
          console.log('DATABASE:', dbLog);
        }
      },

      logError: (error: Error, query?: string) => {
        console.error('DATABASE_ERROR:', {
          timestamp: new Date().toISOString(),
          error: {
            name: error.name,
            message: error.message,
          },
          query,
        });
      },
    };
  }

  // WebSocket logging
  static websocketLogger() {
    return {
      logConnection: (socketId: string, userId?: string) => {
        console.log('WEBSOCKET_CONNECT:', {
          timestamp: new Date().toISOString(),
          socketId,
          userId,
          type: 'connection',
        });
      },

      logDisconnection: (socketId: string, userId?: string, reason?: string) => {
        console.log('WEBSOCKET_DISCONNECT:', {
          timestamp: new Date().toISOString(),
          socketId,
          userId,
          reason,
          type: 'disconnection',
        });
      },

      logEvent: (socketId: string, event: string, userId?: string, data?: any) => {
        console.log('WEBSOCKET_EVENT:', {
          timestamp: new Date().toISOString(),
          socketId,
          userId,
          event,
          dataSize: data ? Buffer.byteLength(JSON.stringify(data), 'utf8') : 0,
        });
      },

      logError: (socketId: string, error: Error, userId?: string) => {
        console.error('WEBSOCKET_ERROR:', {
          timestamp: new Date().toISOString(),
          socketId,
          userId,
          error: {
            name: error.name,
            message: error.message,
          },
        });
      },
    };
  }

  // External API logging utility
  static externalAPILogger() {
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'authorization', 'x-api-key'];

    const sanitizeData = (data: any): any => {
      if (!data) return data;
      const sanitized = JSON.parse(JSON.stringify(data));

      const maskSensitiveFields = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        for (const key in obj) {
          if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            obj[key] = '***MASKED***';
          } else if (typeof obj[key] === 'object') {
            obj[key] = maskSensitiveFields(obj[key]);
          }
        }
        return obj;
      };

      return maskSensitiveFields(sanitized);
    };

    return {
      logAPICall: (data: {
        serviceName: string;
        method: string;
        url: string;
        headers?: Record<string, any>;
        requestBody?: any;
        httpStatus?: number;
        responseTime?: number;
        responseData?: any;
        error?: string;
        userId?: string;
      }) => {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const logEntry: ExternalAPILogEntry = {
          timestamp: new Date().toISOString(),
          requestId,
          serviceName: data.serviceName,
          method: data.method,
          url: data.url,
          headers: sanitizeData(data.headers),
          requestBody: sanitizeData(data.requestBody),
          httpStatus: data.httpStatus,
          responseTime: data.responseTime,
          responseData: sanitizeData(data.responseData),
          error: data.error,
          userId: data.userId,
          success: !data.error && data.httpStatus ? data.httpStatus >= 200 && data.httpStatus < 400 : false
        };

        this.addExternalAPILog(logEntry);
        this.consoleExternalAPILog(logEntry);

        return requestId;
      },

      logAPIRequest: (data: {
        serviceName: string;
        method: string;
        url: string;
        headers?: Record<string, any>;
        requestBody?: any;
        userId?: string;
      }) => {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log('\n' + '='.repeat(80));
        console.log(`🚀 외부 API 요청 시작 [${data.serviceName}]`);
        console.log('='.repeat(80));
        console.log(`📝 Request ID: ${requestId}`);
        console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
        console.log(`🌐 Service: ${data.serviceName}`);
        console.log(`🔗 Method: ${data.method}`);
        console.log(`🎯 URL: ${data.url}`);

        if (data.headers) {
          console.log(`📋 Headers:`);
          console.log(JSON.stringify(sanitizeData(data.headers), null, 2));
        }

        if (data.requestBody) {
          console.log(`📦 Request Body:`);
          console.log(JSON.stringify(sanitizeData(data.requestBody), null, 2));
        }

        if (data.userId) {
          console.log(`👤 User ID: ${data.userId}`);
        }

        console.log('='.repeat(80) + '\n');

        return requestId;
      },

      logAPIResponse: (requestId: string, data: {
        serviceName: string;
        httpStatus?: number;
        responseTime?: number;
        responseData?: any;
        error?: string;
      }) => {
        const emoji = data.error ? '❌' : '✅';

        console.log('\n' + '='.repeat(80));
        console.log(`${emoji} 외부 API 응답 완료 [${data.serviceName}]`);
        console.log('='.repeat(80));
        console.log(`📝 Request ID: ${requestId}`);
        console.log(`🕐 Timestamp: ${new Date().toISOString()}`);

        if (data.httpStatus) {
          const statusEmoji = data.httpStatus >= 200 && data.httpStatus < 300 ? '✅' :
                             data.httpStatus >= 400 && data.httpStatus < 500 ? '⚠️' : '❌';
          console.log(`${statusEmoji} HTTP Status: ${data.httpStatus}`);
        }

        if (data.responseTime) {
          console.log(`⏱️ Response Time: ${data.responseTime}ms`);
        }

        if (data.responseData) {
          console.log(`📥 Response Data:`);
          console.log(JSON.stringify(sanitizeData(data.responseData), null, 2));
        }

        if (data.error) {
          console.log(`❌ Error: ${data.error}`);
        }

        console.log('='.repeat(80) + '\n');
      }
    };
  }

  // Private helper methods
  private static addLog(log: LogEntry): void {
    this.logs.push(log);
    
    // Keep only last MAX_LOGS entries
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }
  }

  private static addSecurityLog(log: SecurityLogEntry): void {
    this.securityLogs.push(log);

    // Keep only last MAX_LOGS entries
    if (this.securityLogs.length > this.MAX_LOGS) {
      this.securityLogs = this.securityLogs.slice(-this.MAX_LOGS);
    }
  }

  private static addExternalAPILog(log: ExternalAPILogEntry): void {
    this.externalAPILogs.push(log);

    // Keep only last MAX_LOGS entries
    if (this.externalAPILogs.length > this.MAX_LOGS) {
      this.externalAPILogs = this.externalAPILogs.slice(-this.MAX_LOGS);
    }
  }

  private static consoleLog(log: LogEntry): void {
    const logLevel = this.getLogLevel(log.statusCode);
    const color = this.getStatusColor(log.statusCode);
    
    const logMessage = `${log.method} ${log.path} - ${log.statusCode} - ${log.responseTime}ms - ${log.ip}${log.userId ? ` - User: ${log.userId}` : ''}`;

    switch (logLevel) {
      case 'error':
        console.error(color, logMessage);
        break;
      case 'warn':
        console.warn(color, logMessage);
        break;
      case 'info':
      default:
        console.log(color, logMessage);
        break;
    }
  }

  private static consoleSecurityLog(log: SecurityLogEntry): void {
    const color = log.success ? '\x1b[32m' : '\x1b[31m'; // Green for success, red for failure
    const logMessage = `SECURITY: ${log.event} - ${log.success ? 'SUCCESS' : 'FAILED'} - ${log.ip}${log.userId ? ` - User: ${log.userId}` : ''}${log.reason ? ` - ${log.reason}` : ''}`;

    if (log.success) {
      console.log(color, logMessage, '\x1b[0m');
    } else {
      console.warn(color, logMessage, '\x1b[0m');
    }
  }

  private static consoleExternalAPILog(log: ExternalAPILogEntry): void {
    const color = log.success ? '\x1b[32m' : '\x1b[31m'; // Green for success, red for failure
    const logMessage = `EXTERNAL_API: ${log.serviceName} - ${log.method} ${log.url} - ${log.httpStatus || 'N/A'} - ${log.responseTime || 'N/A'}ms${log.userId ? ` - User: ${log.userId}` : ''}${log.error ? ` - Error: ${log.error}` : ''}`;

    if (log.success) {
      console.log(color, logMessage, '\x1b[0m');
    } else {
      console.error(color, logMessage, '\x1b[0m');
    }
  }

  private static getLogLevel(statusCode?: number): 'info' | 'warn' | 'error' {
    if (!statusCode) return 'info';
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  private static getStatusColor(statusCode?: number): string {
    if (!statusCode) return '\x1b[0m'; // Reset
    if (statusCode >= 500) return '\x1b[31m'; // Red
    if (statusCode >= 400) return '\x1b[33m'; // Yellow
    if (statusCode >= 300) return '\x1b[36m'; // Cyan
    if (statusCode >= 200) return '\x1b[32m'; // Green
    return '\x1b[0m'; // Reset
  }

  // Public methods to retrieve logs
  static getLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  static getSecurityLogs(limit: number = 100): SecurityLogEntry[] {
    return this.securityLogs.slice(-limit);
  }

  static getExternalAPILogs(limit: number = 100): ExternalAPILogEntry[] {
    return this.externalAPILogs.slice(-limit);
  }

  static getLogsByUser(userId: string, limit: number = 100): LogEntry[] {
    return this.logs
      .filter(log => log.userId === userId)
      .slice(-limit);
  }

  static getLogsByTimeRange(startTime: Date, endTime: Date): LogEntry[] {
    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp);
      return logTime >= startTime && logTime <= endTime;
    });
  }

  static clearLogs(): void {
    this.logs = [];
    this.securityLogs = [];
    this.externalAPILogs = [];
  }

  // Export logs to JSON for external analysis
  static exportLogs(): { logs: LogEntry[]; securityLogs: SecurityLogEntry[]; externalAPILogs: ExternalAPILogEntry[]; exportedAt: string } {
    return {
      logs: this.logs,
      securityLogs: this.securityLogs,
      externalAPILogs: this.externalAPILogs,
      exportedAt: new Date().toISOString(),
    };
  }

  // API Logger factory method
  static apiLogger() {
    return {
      logRequest: (req: Request, metadata?: any) => {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          requestId: req.requestId || 'unknown',
          requestSize: (req.get && req.get('Content-Length')) ? parseInt(req.get('Content-Length')!) : undefined,
          metadata,
        };
        this.addLog(entry);
      },
      logResponse: (reqOrId: Request | string, resOrStatus: Response | number, responseTime?: number, metadataOrUserId?: any) => {
        let entry: LogEntry;

        if (typeof reqOrId === 'string') {
          // Called with (requestId, statusCode, responseTime, userId)
          entry = {
            timestamp: new Date().toISOString(),
            method: 'RESPONSE',
            path: 'unknown',
            statusCode: resOrStatus as number,
            responseTime: responseTime,
            ip: 'unknown',
            requestId: reqOrId,
            userId: metadataOrUserId,
          };
        } else {
          // Called with (req, res, responseTime, metadata)
          const req = reqOrId;
          const res = resOrStatus as Response;
          entry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTime: responseTime,
            ip: req.ip || 'unknown',
            userAgent: req.get ? req.get('User-Agent') : 'unknown',
            requestId: req.requestId || 'unknown',
            responseSize: res.get('Content-Length') ? parseInt(res.get('Content-Length')!) : undefined,
            metadata: metadataOrUserId,
          };
        }

        this.addLog(entry);
      },
      logApiCall: (requestId: string, method: string, path: string, userId?: string) => {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          method,
          path,
          userId,
          requestId,
          ip: 'api-call',
          userAgent: 'internal',
        };
        this.addLog(entry);
      },
      logError: (reqOrId: Request | string, error: Error, metadataOrUserId?: any) => {
        let entry: LogEntry;

        if (typeof reqOrId === 'string') {
          // Called with (requestId, error, userId)
          entry = {
            timestamp: new Date().toISOString(),
            method: 'ERROR',
            path: 'unknown',
            ip: 'unknown',
            requestId: reqOrId,
            error: error.message,
            userId: metadataOrUserId,
          };
        } else {
          // Called with (req, error, metadata)
          const req = reqOrId;
          entry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            ip: req.ip || 'unknown',
            userAgent: req.get ? req.get('User-Agent') : 'unknown',
            requestId: req.requestId || 'unknown',
            error: error.message,
            metadata: metadataOrUserId,
          };
        }

        this.addLog(entry);
      },
      logNotFound: (req: Request) => {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          statusCode: 404,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          requestId: req.requestId || 'unknown',
        };
        this.addLog(entry);
      },
    };
  }

  // Auth Logger factory method
  static authLogger() {
    return {
      logAuthAttempt: (req: Request, email: string, success: boolean, reason?: string) => {
        const securityEntry: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          type: 'auth_attempt',
          severity: success ? 'info' : 'warning',
          userId: email,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          requestId: req.requestId || 'unknown',
          details: {
            email,
            success,
            reason,
            method: req.method,
            path: req.path,
          },
        };
        this.addSecurityLog(securityEntry);
      },
      logAuthSuccess: (req: Request, userId: string, role: string) => {
        const securityEntry: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          type: 'auth_success',
          severity: 'info',
          userId,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          requestId: req.requestId || 'unknown',
          details: {
            userId,
            role,
            loginTime: new Date().toISOString(),
          },
        };
        this.addSecurityLog(securityEntry);
      },
      logAuthFailure: (req: Request, email: string, reason: string) => {
        const securityEntry: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          type: 'auth_failure',
          severity: 'warning',
          userId: email,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          requestId: req.requestId || 'unknown',
          details: {
            email,
            reason,
            method: req.method,
            path: req.path,
          },
        };
        this.addSecurityLog(securityEntry);
      },
      logLogout: (req: Request, userId: string) => {
        const securityEntry: SecurityLogEntry = {
          timestamp: new Date().toISOString(),
          type: 'logout',
          severity: 'info',
          userId,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent'),
          requestId: req.requestId || 'unknown',
          details: {
            userId,
            logoutTime: new Date().toISOString(),
          },
        };
        this.addSecurityLog(securityEntry);
      },
    };
  }
}

export default LoggingMiddleware;