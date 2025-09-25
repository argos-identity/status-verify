import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  requestId?: string;
  details?: any;
  stack?: string;
}

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class ErrorMiddleware {
  // Main error handling middleware
  static handleErrors(): ErrorRequestHandler {
    return (error: CustomError, req: Request, res: Response, next: NextFunction) => {
      // Generate request ID for tracking
      const requestId = req.headers['x-request-id'] as string || 
                       `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Log error details
      console.error('Error occurred:', {
        requestId,
        method: req.method,
        path: req.path,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        userId: (req as any).user?.userId,
        ip: req.ip,
      });

      // Build base error response
      const errorResponse: ErrorResponse = {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        requestId,
      };

      // Handle different error types
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.handlePrismaError(error, errorResponse);
      } else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        this.handlePrismaUnknownError(error, errorResponse);
      } else if (error instanceof Prisma.PrismaClientValidationError) {
        this.handlePrismaValidationError(error, errorResponse);
      } else if (error.name === 'ValidationError') {
        this.handleValidationError(error, errorResponse);
      } else if (error.name === 'JsonWebTokenError') {
        this.handleJWTError(error, errorResponse);
      } else if (error.name === 'TokenExpiredError') {
        this.handleTokenExpiredError(error, errorResponse);
      } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
        this.handleJSONError(error, errorResponse);
      } else if (error.code === 'ECONNREFUSED') {
        this.handleConnectionError(error, errorResponse);
      } else if (error.statusCode) {
        // Custom application errors
        this.handleCustomError(error, errorResponse);
      } else {
        // Generic server errors
        this.handleGenericError(error, errorResponse);
      }

      // Include stack trace in development
      if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = error.stack;
      }

      // Send error response
      res.status(errorResponse.statusCode).json(errorResponse);
    };
  }

  private static handlePrismaError(error: Prisma.PrismaClientKnownRequestError, response: ErrorResponse): void {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        response.statusCode = 409;
        response.error = 'Duplicate entry';
        response.message = 'A record with this information already exists';
        response.details = {
          field: error.meta?.target,
          constraint: 'unique_violation',
        };
        break;

      case 'P2025':
        // Record not found
        response.statusCode = 404;
        response.error = 'Not found';
        response.message = 'The requested record was not found';
        break;

      case 'P2003':
        // Foreign key constraint violation
        response.statusCode = 400;
        response.error = 'Reference error';
        response.message = 'Referenced record does not exist';
        response.details = {
          field: error.meta?.field_name,
          constraint: 'foreign_key_violation',
        };
        break;

      case 'P2014':
        // Required relation missing
        response.statusCode = 400;
        response.error = 'Relation error';
        response.message = 'Required related record is missing';
        break;

      case 'P2000':
        // Value too long
        response.statusCode = 400;
        response.error = 'Value too long';
        response.message = 'Input value is too long for the field';
        response.details = {
          field: error.meta?.column_name,
        };
        break;

      case 'P2001':
        // Record does not exist
        response.statusCode = 404;
        response.error = 'Record not found';
        response.message = 'The record you are looking for does not exist';
        break;

      default:
        response.statusCode = 500;
        response.error = 'Database error';
        response.message = 'A database error occurred';
        response.details = {
          code: error.code,
          meta: error.meta,
        };
    }
  }

  private static handlePrismaUnknownError(error: Prisma.PrismaClientUnknownRequestError, response: ErrorResponse): void {
    response.statusCode = 500;
    response.error = 'Database error';
    response.message = 'An unknown database error occurred';
    response.details = {
      type: 'unknown_database_error',
    };
  }

  private static handlePrismaValidationError(error: Prisma.PrismaClientValidationError, response: ErrorResponse): void {
    response.statusCode = 400;
    response.error = 'Database validation error';
    response.message = 'Invalid data provided to database';
    
    // Try to extract field information from error message
    const fieldMatch = error.message.match(/Argument `(\w+)`/);
    if (fieldMatch) {
      response.details = {
        field: fieldMatch[1],
        type: 'validation_error',
      };
    }
  }

  private static handleValidationError(error: CustomError, response: ErrorResponse): void {
    response.statusCode = 400;
    response.error = 'Validation error';
    response.message = error.message || 'Invalid input data';
    response.details = error.details || {
      type: 'validation_error',
    };
  }

  private static handleJWTError(error: Error, response: ErrorResponse): void {
    response.statusCode = 401;
    response.error = 'Authentication error';
    response.message = 'Invalid authentication token';
    response.details = {
      type: 'invalid_token',
    };
  }

  private static handleTokenExpiredError(error: Error, response: ErrorResponse): void {
    response.statusCode = 401;
    response.error = 'Token expired';
    response.message = 'Your session has expired. Please login again.';
    response.details = {
      type: 'expired_token',
      code: 'TOKEN_EXPIRED',
    };
  }

  private static handleJSONError(error: Error, response: ErrorResponse): void {
    response.statusCode = 400;
    response.error = 'Invalid JSON';
    response.message = 'Request body contains invalid JSON';
    response.details = {
      type: 'json_parse_error',
    };
  }

  private static handleConnectionError(error: CustomError, response: ErrorResponse): void {
    response.statusCode = 503;
    response.error = 'Service unavailable';
    response.message = 'Unable to connect to external service';
    response.details = {
      type: 'connection_error',
      code: error.code,
    };
  }

  private static handleCustomError(error: CustomError, response: ErrorResponse): void {
    response.statusCode = error.statusCode || 500;
    response.error = error.name || 'Application error';
    response.message = error.message || 'An application error occurred';
    response.details = error.details || {
      type: 'custom_error',
    };
  }

  private static handleGenericError(error: Error, response: ErrorResponse): void {
    response.statusCode = 500;
    response.error = 'Internal server error';
    response.message = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'An unexpected error occurred';
    response.details = {
      type: 'generic_error',
      name: error.name,
    };
  }

  // 404 handler for unknown routes
  static handleNotFound() {
    return (req: Request, res: Response, next: NextFunction) => {
      const errorResponse: ErrorResponse = {
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
        statusCode: 404,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        details: {
          type: 'route_not_found',
          availableRoutes: [
            'GET /api/system-status',
            'GET /api/services',
            'GET /api/uptime/:serviceId',
            'POST /api/incidents',
            'GET /api/incidents/:id',
            'PUT /api/incidents/:id',
            'DELETE /api/incidents/:id',
            'POST /api/incidents/:id/updates',
            'GET /api/incidents/past',
            'GET /api/sla/response-times/:serviceId',
            'GET /api/sla/availability/:serviceId',
            'POST /api/auth/login',
            'POST /api/auth/refresh',
          ],
        },
      };

      res.status(404).json(errorResponse);
    };
  }

  // Async error wrapper
  static asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Request timeout handler
  static timeout(ms: number = 30000) {
    return (req: Request, res: Response, next: NextFunction) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          const errorResponse: ErrorResponse = {
            error: 'Request timeout',
            message: `Request timed out after ${ms}ms`,
            statusCode: 408,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method,
            details: {
              type: 'timeout_error',
              timeout: ms,
            },
          };
          
          res.status(408).json(errorResponse);
        }
      }, ms);

      // Clear timeout when response is sent
      res.on('finish', () => {
        clearTimeout(timeout);
      });

      next();
    };
  }

  // Rate limiting error handler
  static handleRateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
      const errorResponse: ErrorResponse = {
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        statusCode: 429,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        details: {
          type: 'rate_limit_exceeded',
          retryAfter: '60', // seconds
        },
      };

      res.status(429).json(errorResponse);
    };
  }

  // CORS error handler
  static handleCorsError() {
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      
      const errorResponse: ErrorResponse = {
        error: 'CORS error',
        message: 'Cross-Origin Request Blocked',
        statusCode: 403,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        details: {
          type: 'cors_error',
          origin,
          allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
        },
      };

      res.status(403).json(errorResponse);
    };
  }

  // Health check error handler
  static handleHealthCheckError(error: Error) {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        type: 'health_check_failed',
      },
      services: {
        database: 'error',
        external_apis: 'unknown',
      },
    };
  }

  // Create custom error
  static createError(message: string, statusCode: number = 500, details?: any): CustomError {
    const error = new Error(message) as CustomError;
    error.statusCode = statusCode;
    error.details = details;
    return error;
  }

  // Alias for compatibility
  static errorHandler() {
    return this.handleErrors();
  }
}

export default ErrorMiddleware;