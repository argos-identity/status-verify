import { Request, Response, NextFunction } from 'express';
import SystemService from '../services/system-service';
import validationMiddleware from '../middleware/validation-middleware';
import LoggingMiddleware from '../middleware/logging-middleware';

export class SystemController {
  private logger = LoggingMiddleware.apiLogger();

  public async getSystemStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/system-status',
        req.user?.userId
      );

      // Get comprehensive system status
      const systemStatus = await SystemService.getSystemStatus();
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: systemStatus,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSystemMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/system-metrics',
        req.user?.userId
      );

      // Parse query parameters for time range
      const { 
        timeRange = '24h',
        serviceId,
        includeDetails = 'false'
      } = req.query;

      // Validate time range
      const validTimeRanges = ['1h', '6h', '24h', '7d', '30d'];
      if (!validTimeRanges.includes(timeRange as string)) {
        return next({
          status: 400,
          message: `Invalid timeRange. Must be one of: ${validTimeRanges.join(', ')}`,
        });
      }

      // Get system metrics
      const metrics = await SystemService.getSystemMetrics({
        timeRange: timeRange as string,
        serviceId: serviceId as string,
        includeDetails: includeDetails === 'true',
      });
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: metrics,
        timeRange,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSystemHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/system-health',
        req.user?.userId
      );

      // Get detailed system health information
      const healthData = await SystemService.getSystemHealth();
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: healthData,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async updateSystemSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        '/api/system-settings',
        req.user?.userId,
        req.body
      );

      // Validate request body
      const validationResult = validationMiddleware.validateSystemSettings(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Update system settings
      const updatedSettings = await SystemService.updateSystemSettings(
        req.body,
        req.user?.userId || 'system'
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: updatedSettings,
        message: 'System settings updated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSystemAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/system-alerts',
        req.user?.userId
      );

      // Parse query parameters
      const {
        severity,
        status = 'active',
        limit = '50',
        offset = '0'
      } = req.query;

      // Validate parameters
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      const validStatuses = ['active', 'resolved', 'suppressed'];
      
      if (severity && !validSeverities.includes(severity as string)) {
        return next({
          status: 400,
          message: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
        });
      }

      if (!validStatuses.includes(status as string)) {
        return next({
          status: 400,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      // Get system alerts
      const alerts = await SystemService.getSystemAlerts({
        severity: severity as string,
        status: status as string,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: alerts,
        pagination: {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          total: alerts.length,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async acknowledgeAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { alertId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/system-alerts/${alertId}/acknowledge`,
        req.user?.userId,
        req.body
      );

      // Validate alert ID
      if (!alertId || alertId.trim() === '') {
        return next({
          status: 400,
          message: 'Alert ID is required',
        });
      }

      // Acknowledge alert
      const result = await SystemService.acknowledgeAlert(
        alertId,
        req.user?.userId || 'system',
        req.body.message
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: result,
        message: 'Alert acknowledged successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSystemConfiguration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/system-configuration',
        req.user?.userId
      );

      // Get system configuration (sanitized for client)
      const configuration = await SystemService.getSystemConfiguration();
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: configuration,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }
}

// Create singleton instance
const systemController = new SystemController();

export default systemController;