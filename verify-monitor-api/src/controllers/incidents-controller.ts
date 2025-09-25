import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import IncidentService from '../services/incident-service';
import validationMiddleware from '../middleware/validation-middleware';
import rbacMiddleware from '../middleware/rbac-middleware';
import LoggingMiddleware from '../middleware/logging-middleware';

export class IncidentsController {
  private logger = LoggingMiddleware.apiLogger();

  public async createIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        '/api/incidents',
        req.user?.userId,
        req.body
      );

      // Validate request body
      const validationResult = validationMiddleware.validateIncident(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Create incident with reporter field
      const incident = await IncidentService.createIncident(
        {
          ...req.body,
          reporter: req.body.reporter || req.user?.name || 'Unknown'
        },
        req.user?.userId || 'system'
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        201,
        duration,
        req.user?.userId
      );

      res.status(201).json({
        success: true,
        data: incident,
        message: 'Incident created successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/incidents/${incidentId}`,
        req.user?.userId
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Parse query parameters
      const {
        includeUpdates = 'true',
        includeTimeline = 'false'
      } = req.query;

      // Get incident
      const incident = await IncidentService.getIncident(incidentId, {
        includeUpdates: includeUpdates === 'true',
        includeTimeline: includeTimeline === 'true',
      });

      if (!incident) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        data: incident,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async updateIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'PUT',
        `/api/incidents/${incidentId}`,
        req.user?.userId,
        req.body
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Validate request body
      const validationResult = validationMiddleware.validateIncidentUpdate(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Update incident
      const incident = await IncidentService.updateIncident(
        incidentId,
        req.body,
        req.user?.userId || 'system'
      );

      if (!incident) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        data: incident,
        message: 'Incident updated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async deleteIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'DELETE',
        `/api/incidents/${incidentId}`,
        req.user?.userId
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Delete incident
      const success = await IncidentService.deleteIncident(
        incidentId,
        req.user?.userId || 'system'
      );

      if (!success) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        message: 'Incident deleted successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async addIncidentUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/incidents/${incidentId}/updates`,
        req.user?.userId,
        req.body
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Validate request body
      const validationResult = validationMiddleware.validateIncidentUpdate(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Add incident update
      const update = await IncidentService.addIncidentUpdate(
        incidentId,
        {
          ...req.body,
          user_id: req.user?.userId || 'system',
        }
      );

      if (!update) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        data: update,
        message: 'Incident update added successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getIncidentUpdates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/incidents/${incidentId}/updates`,
        req.user?.userId
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Parse query parameters
      const {
        limit = '50',
        offset = '0',
        orderBy = 'created_at',
        orderDirection = 'desc'
      } = req.query;

      // Get incident updates
      const updates = await IncidentService.getIncidentUpdates(incidentId, {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        orderBy: orderBy as string,
        orderDirection: orderDirection as 'asc' | 'desc',
      });

      if (updates === null) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        data: updates,
        pagination: {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          total: updates.length,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getAllIncidents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/incidents/detail',
        req.user?.userId
      );

      // Parse query parameters
      const {
        limit = '100',
        offset = '0',
        severity,
        serviceId,
        sortBy = 'created_at',
        sortOrder = 'desc',
        includeUpdates = 'true'
      } = req.query;

      // Get all incidents (no status filter - select * from)
      const result = await IncidentService.getAllIncidents(
        parseInt(limit as string, 10),
        parseInt(offset as string, 10)
        // No status filter to get all incidents
      );

      let incidents = result.incidents;

      // Apply additional filters if provided
      if (severity) {
        incidents = incidents.filter(incident => incident.severity === severity);
      }

      if (serviceId) {
        incidents = incidents.filter(incident =>
          incident.affected_services.includes(serviceId)
        );
      }

      // Sort results
      if (sortBy === 'created_at') {
        incidents.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
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
        data: incidents,
        pagination: {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          total: incidents.length,
        },
        filters: {
          severity,
          serviceId,
          sortBy,
          sortOrder,
          includeUpdates,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getPastIncidents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/incidents/past',
        req.user?.userId
      );

      // Parse query parameters
      const {
        limit = '50',
        offset = '0',
        severity,
        serviceId,
        timeRange = '90d'
      } = req.query;

      // Get past incidents - only resolved status
      const incidents = await IncidentService.getPastIncidents({
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        severity: severity as string,
        status: 'resolved', // Force resolved status for past incidents
        serviceId: serviceId as string,
        timeRange: timeRange as string,
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
        data: incidents,
        pagination: {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          total: incidents.length,
        },
        filters: {
          severity,
          status: 'resolved',
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

  public async getActiveIncidents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/incidents/active',
        req.user?.userId
      );

      // Parse query parameters
      const {
        severity,
        serviceId,
        assignedTo
      } = req.query;

      // Get active incidents
      const incidents = await IncidentService.getActiveIncidents({
        severity: severity as string,
        serviceId: serviceId as string,
        assignedTo: assignedTo as string,
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
        data: incidents,
        count: incidents.length,
        filters: {
          severity,
          serviceId,
          assignedTo,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async assignIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/incidents/${incidentId}/assign`,
        req.user?.userId,
        req.body
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Validate assignee
      if (!req.body.assigneeId) {
        return next({
          status: 400,
          message: 'Assignee ID is required',
        });
      }

      // Assign incident
      const result = await IncidentService.assignIncident(
        incidentId,
        req.body.assigneeId,
        req.user?.userId || 'system',
        req.body.message
      );

      if (!result) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        message: 'Incident assigned successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async escalateIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { incidentId } = req.params;

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        `/api/incidents/${incidentId}/escalate`,
        req.user?.userId,
        req.body
      );

      // Validate incident ID
      if (!incidentId || incidentId.trim() === '') {
        return next({
          status: 400,
          message: 'Incident ID is required',
        });
      }

      // Escalate incident
      const result = await IncidentService.escalateIncident(
        incidentId,
        req.user?.userId || 'system',
        req.body.reason,
        req.body.newSeverity
      );

      if (!result) {
        return next({
          status: 404,
          message: 'Incident not found',
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
        message: 'Incident escalated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getIncidentsByDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { date, serviceId } = req.query;

      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/incidents/by-date',
        req.user?.userId
      );

      // Validate date parameter
      if (!date || typeof date !== 'string') {
        return next({
          status: 400,
          message: 'Date parameter is required (format: YYYY-MM-DD)',
        });
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return next({
          status: 400,
          message: 'Invalid date format. Use YYYY-MM-DD',
        });
      }

      // Validate that the date is valid
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return next({
          status: 400,
          message: 'Invalid date value',
        });
      }

      // Get incidents by date
      const result = await IncidentService.getIncidentsByDate(
        date,
        serviceId as string
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
    router.get('/detail', this.getAllIncidents.bind(this)); // New endpoint for all incidents
    router.get('/by-date', this.getIncidentsByDate.bind(this)); // New endpoint for incidents by date
    router.get('/past', this.getPastIncidents.bind(this));
    router.get('/active', this.getActiveIncidents.bind(this));
    router.get('/:incidentId', this.getIncident.bind(this));
    router.get('/:incidentId/updates', this.getIncidentUpdates.bind(this));

    // Reporter routes
    router.post('/',
      rbacMiddleware.requirePermission('report_incidents'),
      this.createIncident.bind(this)
    );
    
    router.post('/:incidentId/updates',
      rbacMiddleware.requirePermission('comment_incidents'),
      this.addIncidentUpdate.bind(this)
    );

    // Manager routes
    router.put('/:incidentId',
      rbacMiddleware.requirePermission('manage_incidents'),
      this.updateIncident.bind(this)
    );
    
    router.post('/:incidentId/assign',
      rbacMiddleware.requirePermission('manage_incidents'),
      this.assignIncident.bind(this)
    );
    
    router.post('/:incidentId/escalate',
      rbacMiddleware.requirePermission('manage_incidents'),
      this.escalateIncident.bind(this)
    );

    // Admin routes
    router.delete('/:incidentId',
      rbacMiddleware.requireRole('admin'),
      this.deleteIncident.bind(this)
    );

    return router;
  }
}

// Create singleton instance
const incidentsController = new IncidentsController();

export default incidentsController;