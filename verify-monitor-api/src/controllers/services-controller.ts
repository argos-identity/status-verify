import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { validationResult } from 'express-validator';
import SystemService from '../services/system-service';
import validationMiddleware from '../middleware/validation-middleware';
import rbacMiddleware from '../middleware/rbac-middleware';
import LoggingMiddleware from '../middleware/logging-middleware';

export class ServicesController {
  private logger = LoggingMiddleware.apiLogger();

  public async getAllServices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        '/api/services',
        req.user?.userId
      );

      // Parse query parameters
      const {
        includeStatus = 'true',
        includeMetrics = 'false',
        status
      } = req.query;

      // Get all services with optional filters
      const services = await SystemService.getAllServices();

      const duration = Date.now() - startTime;

      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        data: services,
        count: services.services?.length || 0,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async getService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'GET',
        `/api/services/${serviceId}`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        res.status(400).json({
          success: false,
          message: 'Service ID is required',
        });
        return;
      }

      // Get service details
      const service = await SystemService.getService(serviceId);

      if (!service) {
        res.status(404).json({
          success: false,
          message: 'Service not found',
        });
        return;
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
        data: service,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async createService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'POST',
        '/api/services',
        req.user?.userId
      );

      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      // Create new service
      const service = await SystemService.createService(req.body);
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        201,
        duration,
        req.user?.userId
      );

      res.status(201).json({
        success: true,
        data: service,
        message: 'Service created successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async updateService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'PUT',
        `/api/services/${serviceId}`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        res.status(400).json({
          success: false,
          message: 'Service ID is required',
        });
        return;
      }

      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      // Update service
      const service = await SystemService.updateService(serviceId, req.body);

      if (!service) {
        res.status(404).json({
          success: false,
          message: 'Service not found',
        });
        return;
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
        data: service,
        message: 'Service updated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logError(req.requestId || 'unknown', error, req.user?.userId);
      next(error);
    }
  }

  public async deleteService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { serviceId } = req.params;
      
      this.logger.logApiCall(
        req.requestId || 'unknown',
        'DELETE',
        `/api/services/${serviceId}`,
        req.user?.userId
      );

      // Validate service ID
      if (!serviceId || serviceId.trim() === '') {
        res.status(400).json({
          success: false,
          message: 'Service ID is required',
        });
        return;
      }

      // Delete service
      await SystemService.deleteService(serviceId);

      // Assume success if no error thrown
      
      const duration = Date.now() - startTime;
      
      this.logger.logResponse(
        req.requestId || 'unknown',
        200,
        duration,
        req.user?.userId
      );

      res.status(200).json({
        success: true,
        message: 'Service deleted successfully',
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
    router.get('/', this.getAllServices.bind(this));
    router.get('/:serviceId', this.getService.bind(this));

    // Admin routes (write operations)
    router.post('/',
      rbacMiddleware.requirePermission('manage_services'),
      this.createService.bind(this)
    );
    
    router.put('/:serviceId',
      rbacMiddleware.requirePermission('manage_services'),
      this.updateService.bind(this)
    );
    
    router.delete('/:serviceId',
      rbacMiddleware.requirePermission('manage_services'),
      this.deleteService.bind(this)
    );

    return router;
  }
}

// Create singleton instance
const servicesController = new ServicesController();

export default servicesController;