import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import UptimeService from '../services/uptime-service';
import validationMiddleware from '../middleware/validation-middleware';
import rbacMiddleware from '../middleware/rbac-middleware';
import LoggingMiddleware from '../middleware/logging-middleware';

export class UptimeController {
  private logger = LoggingMiddleware.apiLogger();

  public async getUptimeData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/uptime/${serviceId}`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Parse query parameters
      const {
        timeRange = '30d',
        granularity = 'day',
        includeDetails = 'false'
      } = req.query;

      // Validate parameters
      const validTimeRanges = ['24h', '7d', '30d', '90d', '365d'];
      const validGranularities = ['hour', 'day', 'week', 'month'];
      
      if (!validTimeRanges.includes(timeRange as string)) {
        return next({
          status: 400,
          message: `Invalid timeRange. Must be one of: ${validTimeRanges.join(', ')}`,
        });
      }

      if (!validGranularities.includes(granularity as string)) {
        return next({
          status: 400,
          message: `Invalid granularity. Must be one of: ${validGranularities.join(', ')}`,
        });
      }

      // Get uptime data (simplified implementation for now)
      const uptimeData = await UptimeService.getServiceUptimeStats(serviceId);

      if (!uptimeData) {
        return next({
          status: 404,
          message: 'Service not found',
        });
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: uptimeData,
        timeRange,
        granularity,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getUptimeStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/uptime/${serviceId}/statistics`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Parse query parameters
      const {
        timeRange = '30d',
        compareWith
      } = req.query;

      // Get uptime statistics (simplified implementation for now)
      const statistics = await UptimeService.getServiceUptimeStats(serviceId);

      if (!statistics) {
        return next({
          status: 404,
          message: 'Service not found',
        });
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: statistics,
        timeRange,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async recordUptimeEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/uptime/${serviceId}/events`,
        req.user?.userId,
        req.body
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Validate request body
      const validationResult = validationMiddleware.validateUptimeEvent(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Record uptime event (simplified implementation for now)
      const event = await UptimeService.recordDailyUptime(
        serviceId,
        new Date(req.body.timestamp || new Date()),
        req.body.status || 'o',
        req.body.responseTime,
        req.body.errorMessage
      );

      if (!event) {
        return next({
          status: 404,
          message: 'Service not found',
        });
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        201,
        duration,
        req.user?.userId
      );

      res.status(201).json({
        success: true,
        data: event,
        message: 'Uptime event recorded successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getDowntimeEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/uptime/${serviceId}/downtime`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Parse query parameters
      const {
        timeRange = '30d',
        limit = '50',
        offset = '0',
        severity
      } = req.query;

      // Get downtime events (simplified implementation for now)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const downtimeEvents = await UptimeService.getUptimeForDateRange(serviceId, startDate, endDate);

      if (downtimeEvents === null) {
        return next({
          status: 404,
          message: 'Service not found',
        });
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: downtimeEvents,
        pagination: {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          total: downtimeEvents.length,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getUptimeTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/uptime/${serviceId}/trends`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Parse query parameters
      const {
        timeRange = '90d',
        granularity = 'week'
      } = req.query;

      // Get uptime trends (use existing method)
      const trends = await UptimeService.getUptimeTrends(serviceId, 30);

      if (!trends) {
        return next({
          status: 404,
          message: 'Service not found',
        });
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: trends,
        timeRange,
        granularity,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async bulkRecordUptime(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        '/api/uptime/bulk',
        req.user?.userId,
        { eventCount: req.body?.events?.length || 0 }
      );

      // Validate request body
      if (!req.body.events || !Array.isArray(req.body.events)) {
        return next({
          status: 400,
          message: 'Events array is required',
        });
      }

      if (req.body.events.length === 0) {
        return next({
          status: 400,
          message: 'At least one event is required',
        });
      }

      if (req.body.events.length > 1000) {
        return next({
          status: 400,
          message: 'Maximum 1000 events allowed per request',
        });
      }

      // Validate each event
      for (const event of req.body.events) {
        const validationResult = validationMiddleware.validateBulkUptimeEvent(event);
        if (!validationResult.isValid) {
          return next({
            status: 400,
            message: 'Validation failed for bulk events',
            details: validationResult.errors,
          });
        }
      }

      // Record bulk uptime events (simplified implementation for now)
      let successful = 0;
      let failed = 0;

      for (const event of req.body.events) {
        try {
          await UptimeService.recordDailyUptime(
            event.serviceId,
            new Date(event.timestamp || new Date()),
            event.status || 'o',
            event.responseTime,
            event.errorMessage
          );
          successful++;
        } catch (error) {
          failed++;
        }
      }

      const results = { successful, failed };
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: results,
        message: `${results.successful} events recorded successfully, ${results.failed} failed`,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getUptimeReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/uptime/report',
        req.user?.userId
      );

      // Parse query parameters
      const {
        serviceIds,
        timeRange = '30d',
        format = 'json',
        includeCharts = 'false'
      } = req.query;

      // Validate format
      const validFormats = ['json', 'csv'];
      if (!validFormats.includes(format as string)) {
        return next({
          status: 400,
          message: `Invalid format. Must be one of: ${validFormats.join(', ')}`,
        });
      }

      // Parse service IDs
      const serviceIdArray = serviceIds
        ? (serviceIds as string).split(',').map(id => id.trim())
        : [];

      // Generate uptime report (simplified implementation for now)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const report = await UptimeService.generateUptimeReport(
        serviceIdArray,
        startDate,
        endDate
      );

      const duration = Date.now() - startTime;

      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      // Set appropriate content type for CSV
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="uptime-report-${timeRange}.csv"`);
      }

      res.status(200).json({
        success: true,
        data: report,
        format,
        timeRange,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getAllServicesUptimeHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/uptime/history',
        req.user?.userId
      );

      // Parse query parameters
      const {
        months = '6'
      } = req.query;

      // Validate months parameter
      const monthsNum = parseInt(months as string, 10);
      if (isNaN(monthsNum) || monthsNum < 1 || monthsNum > 24) {
        return next({
          status: 400,
          message: 'Invalid months parameter. Must be between 1 and 24',
        });
      }

      // Get all services uptime history
      const uptimeHistory = await UptimeService.getAllServicesUptimeHistory(monthsNum);

      const duration = Date.now() - startTime;

      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: uptimeHistory,
        months: monthsNum,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getServiceUptimeHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/uptime/${serviceId}/history`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Parse query parameters
      const {
        months = '6'
      } = req.query;

      // Validate months parameter
      const monthsNum = parseInt(months as string, 10);
      if (isNaN(monthsNum) || monthsNum < 1 || monthsNum > 24) {
        return next({
          status: 400,
          message: 'Invalid months parameter. Must be between 1 and 24',
        });
      }

      // Get service uptime history
      const serviceHistory = await UptimeService.getServiceUptimeHistory(serviceId, monthsNum);

      if (!serviceHistory) {
        return next({
          status: 404,
          message: 'Service not found',
        });
      }

      const duration = Date.now() - startTime;

      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: serviceHistory,
        months: monthsNum,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  // Create router with all routes
  public createRouter(): Router {
    const router = Router();

    // Public routes (read-only)
    router.get('/report', this.getUptimeReport.bind(this));
    router.get('/history', this.getAllServicesUptimeHistory.bind(this));
    router.get('/:serviceId', this.getUptimeData.bind(this));
    router.get('/:serviceId/statistics', this.getUptimeStatistics.bind(this));
    router.get('/:serviceId/downtime', this.getDowntimeEvents.bind(this));
    router.get('/:serviceId/trends', this.getUptimeTrends.bind(this));
    router.get('/:serviceId/history', this.getServiceUptimeHistory.bind(this));

    // Reporter routes (data recording)
    router.post('/:serviceId/events',
      rbacMiddleware.requirePermission('report_incidents'),
      this.recordUptimeEvent.bind(this)
    );

    router.post('/bulk',
      rbacMiddleware.requirePermission('report_incidents'),
      this.bulkRecordUptime.bind(this)
    );

    return router;
  }
}

// Create singleton instance
const uptimeController = new UptimeController();

export default uptimeController;