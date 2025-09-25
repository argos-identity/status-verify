import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import SLAService from '../services/sla-service';
import validationMiddleware from '../middleware/validation-middleware';
import rbacMiddleware from '../middleware/rbac-middleware';
import LoggingMiddleware from '../middleware/logging-middleware';

export class SLAController {
  private logger = LoggingMiddleware.apiLogger();

  public async getResponseTimes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/sla/response-times/${serviceId}`,
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
        timeRange = '24h',
        granularity = 'hour',
        percentile = '95',
        includeBreakdown = 'false'
      } = req.query;

      // Validate parameters
      const validTimeRanges = ['1h', '6h', '24h', '7d', '30d'];
      const validGranularities = ['minute', 'hour', 'day'];
      const validPercentiles = ['50', '90', '95', '99'];

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

      if (!validPercentiles.includes(percentile as string)) {
        return next({
          status: 400,
          message: `Invalid percentile. Must be one of: ${validPercentiles.join(', ')}`,
        });
      }

      // Get response times
      const responseTimes = await SLAService.getResponseTimes(serviceId, {
        timeRange: timeRange as string,
        granularity: granularity as string,
        percentile: parseInt(percentile as string, 10),
        includeBreakdown: includeBreakdown === 'true',
      });

      if (!responseTimes) {
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
        data: responseTimes,
        parameters: {
          serviceId,
          timeRange,
          granularity,
          percentile: parseInt(percentile as string, 10),
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/sla/availability/${serviceId}`,
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
        includeDowntime = 'false',
        includeSLATargets = 'true'
      } = req.query;

      // Get availability data
      const availability = await SLAService.getAvailability(serviceId, {
        timeRange: timeRange as string,
        granularity: granularity as string,
        includeDowntime: includeDowntime === 'true',
        includeSLATargets: includeSLATargets === 'true',
      });

      if (!availability) {
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
        data: availability,
        parameters: {
          serviceId,
          timeRange,
          granularity,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSLACompliance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/sla/compliance/${serviceId}`,
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
        includeHistory = 'false',
        includePenalties = 'false'
      } = req.query;

      // Get SLA compliance data
      const compliance = await SLAService.getSLACompliance(serviceId, {
        timeRange: timeRange as string,
        includeHistory: includeHistory === 'true',
        includePenalties: includePenalties === 'true',
      });

      if (!compliance) {
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
        data: compliance,
        parameters: {
          serviceId,
          timeRange,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getAllServicesCompliance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/sla/compliance',
        req.user?.userId
      );

      // Parse query parameters
      const {
        timeRange = '30d',
        onlyViolations = 'false',
        sortBy = 'compliance',
        sortOrder = 'asc'
      } = req.query;

      // Get compliance for all services
      const compliance = await SLAService.getAllServicesCompliance({
        timeRange: timeRange as string,
        onlyViolations: onlyViolations === 'true',
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
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
        data: compliance,
        count: compliance.length,
        parameters: {
          timeRange,
          onlyViolations: onlyViolations === 'true',
          sortBy,
          sortOrder,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSLATargets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/sla/targets/${serviceId}`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        return next({
          status: 400,
          message: 'Service ID is required',
        });
      }

      // Get SLA targets
      const targets = await SLAService.getSLATargets(serviceId);

      if (!targets) {
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
        data: targets,
        serviceId,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async updateSLATargets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'PUT',
        `/api/sla/targets/${serviceId}`,
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
      const validationResult = validationMiddleware.validateSLATargets(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Update SLA targets
      const targets = await SLAService.updateSLATargets(
        serviceId,
        req.body,
        req.user?.userId || 'system'
      );

      if (!targets) {
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
        data: targets,
        message: 'SLA targets updated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getSLAViolations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/sla/violations',
        req.user?.userId
      );

      // Parse query parameters
      const {
        serviceId,
        timeRange = '30d',
        severity,
        limit = '50',
        offset = '0'
      } = req.query;

      // Get SLA violations
      const violations = await SLAService.getSLAViolations({
        serviceId: serviceId as string,
        timeRange: timeRange as string,
        severity: severity as string,
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
        data: violations,
        pagination: {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          total: violations.length,
        },
        filters: {
          serviceId,
          timeRange,
          severity,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async acknowledgeSLAViolation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { violationId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/sla/violations/${violationId}/acknowledge`,
        req.user?.userId,
        req.body
      );

      // Validate violation ID
      if (!violationId || violationId.trim() === '') {
        return next({
          status: 400,
          message: 'Violation ID is required',
        });
      }

      // Acknowledge SLA violation
      const result = await SLAService.acknowledgeSLAViolation(
        violationId,
        req.user?.userId || 'system',
        req.body.reason,
        req.body.remediation
      );

      if (!result) {
        return next({
          status: 404,
          message: 'SLA violation not found',
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
        data: result,
        message: 'SLA violation acknowledged successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async generateSLAReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/sla/report',
        req.user?.userId
      );

      // Parse query parameters
      const {
        serviceIds,
        timeRange = '30d',
        format = 'json',
        includeCharts = 'false',
        includeRecommendations = 'true'
      } = req.query;

      // Validate format
      const validFormats = ['json', 'pdf', 'csv'];
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

      // Generate SLA report
      const report = await SLAService.generateSLAReport({
        serviceIds: serviceIdArray,
        timeRange: timeRange as string,
        format: format as string,
        includeCharts: includeCharts === 'true',
        includeRecommendations: includeRecommendations === 'true',
      });
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      // Set appropriate content type for non-JSON formats
      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="sla-report-${timeRange}.pdf"`);
      } else if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="sla-report-${timeRange}.csv"`);
      }

      res.status(200).json({
        success: true,
        data: report,
        parameters: {
          serviceIds: serviceIdArray,
          timeRange,
          format,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async recordResponseTime(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/sla/response-times/${serviceId}/record`,
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
      const validationResult = validationMiddleware.validateResponseTimeRecord(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Record response time
      const record = await SLAService.recordResponseTime(
        serviceId,
        req.body,
        req.user?.userId || 'system'
      );

      if (!record) {
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
        data: record,
        message: 'Response time recorded successfully',
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
    router.get('/compliance', this.getAllServicesCompliance.bind(this));
    router.get('/violations', this.getSLAViolations.bind(this));
    router.get('/report', this.generateSLAReport.bind(this));
    router.get('/response-times/:serviceId', this.getResponseTimes.bind(this));
    router.get('/availability/:serviceId', this.getAvailability.bind(this));
    router.get('/compliance/:serviceId', this.getSLACompliance.bind(this));
    router.get('/targets/:serviceId', this.getSLATargets.bind(this));

    // Reporter routes (data recording)
    router.post('/response-times/:serviceId/record',
      rbacMiddleware.requirePermission('report_incidents'),
      this.recordResponseTime.bind(this)
    );
    
    router.post('/violations/:violationId/acknowledge',
      rbacMiddleware.requirePermission('manage_services'),
      this.acknowledgeSLAViolation.bind(this)
    );

    // Admin routes (configuration)
    router.put('/targets/:serviceId',
      rbacMiddleware.requirePermission('manage_services'),
      this.updateSLATargets.bind(this)
    );

    return router;
  }
}

// Create singleton instance
const slaController = new SLAController();

export default slaController;