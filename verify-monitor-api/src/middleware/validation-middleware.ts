import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain, ValidationError } from 'express-validator';

export interface ValidationOptions {
  skipMissingFields?: boolean;
  sanitize?: boolean;
  customErrorMessages?: boolean;
}

export class ValidationMiddleware {
  // Handle validation errors
  static handleErrors(options: ValidationOptions = {}) {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        const errorDetails = errors.array().map((error: ValidationError) => ({
          field: error.type === 'field' ? (error as any).path : error.type,
          message: error.msg,
          value: error.type === 'field' ? (error as any).value : undefined,
          location: error.type === 'field' ? (error as any).location : undefined,
        }));

        return res.status(400).json({
          error: 'Validation failed',
          message: 'Request contains invalid data',
          details: errorDetails,
          timestamp: new Date().toISOString(),
        });
      }
      
      next();
    };
  }

  // Service validation rules
  static validateService() {
    return [
      body('id')
        .isString()
        .matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .withMessage('Service ID must be in kebab-case format (lowercase letters, numbers, and hyphens only)'),
      body('name')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Service name must be between 1 and 100 characters'),
      body('description')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description must be 500 characters or less'),
      body('endpoint_url')
        .optional()
        .isURL()
        .withMessage('Endpoint URL must be a valid URL'),
    ];
  }

  // Incident validation rules
  static validateIncident() {
    return [
      body('title')
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Title must be between 1 and 200 characters'),
      body('description')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 2000 })
        .withMessage('Description must be between 1 and 2000 characters'),
      body('severity')
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('Severity must be one of: low, medium, high, critical'),
      body('affected_services')
        .isArray({ min: 1 })
        .withMessage('At least one affected service must be specified')
        .custom((services: string[]) => {
          const invalidServices = services.filter(id => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id));
          if (invalidServices.length > 0) {
            throw new Error(`Invalid service IDs: ${invalidServices.join(', ')}`);
          }
          return true;
        }),
    ];
  }

  // Incident update validation rules
  static validateIncidentUpdate() {
    return [
      body('title')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Title must be between 1 and 200 characters'),
      body('description')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 2000 })
        .withMessage('Description must be between 1 and 2000 characters'),
      body('severity')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('Severity must be one of: low, medium, high, critical'),
      body('status')
        .optional()
        .isIn(['investigating', 'identified', 'monitoring', 'resolved'])
        .withMessage('Status must be one of: investigating, identified, monitoring, resolved'),
      body('affected_services')
        .optional()
        .isArray({ min: 1 })
        .withMessage('At least one affected service must be specified')
        .custom((services: string[]) => {
          if (services && Array.isArray(services)) {
            const invalidServices = services.filter(id => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id));
            if (invalidServices.length > 0) {
              throw new Error(`Invalid service IDs: ${invalidServices.join(', ')}`);
            }
          }
          return true;
        }),
    ];
  }

  // Incident comment validation rules
  static validateIncidentComment() {
    return [
      body('message')
        .isString()
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Message must be between 1 and 1000 characters'),
      body('status')
        .optional()
        .isIn(['investigating', 'identified', 'monitoring', 'resolved'])
        .withMessage('Status must be one of: investigating, identified, monitoring, resolved'),
      body('is_public')
        .optional()
        .isBoolean()
        .withMessage('is_public must be a boolean value'),
    ];
  }

  // User registration validation rules
  static validateUserRegistration() {
    return [
      body('name')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Name must be between 1 and 100 characters'),
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Must be a valid email address'),
      body('password')
        .isString()
        .isLength({ min: 8, max: 100 })
        .withMessage('Password must be between 8 and 100 characters')
        .matches(/(?=.*[a-z])/)
        .withMessage('Password must contain at least one lowercase letter')
        .matches(/(?=.*[A-Z])/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/(?=.*\d)/)
        .withMessage('Password must contain at least one number')
        .matches(/(?=.*[@$!%*?&])/)
        .withMessage('Password must contain at least one special character (@$!%*?&)'),
      body('role')
        .optional()
        .isIn(['viewer', 'reporter', 'admin'])
        .withMessage('Role must be one of: viewer, reporter, admin'),
    ];
  }

  // Login validation rules
  static validateLogin() {
    return [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Must be a valid email address'),
      body('password')
        .isString()
        .isLength({ min: 1 })
        .withMessage('Password is required'),
    ];
  }

  // Password change validation rules
  static validatePasswordChange() {
    return [
      body('currentPassword')
        .isString()
        .isLength({ min: 1 })
        .withMessage('Current password is required'),
      body('newPassword')
        .isString()
        .isLength({ min: 8, max: 100 })
        .withMessage('New password must be between 8 and 100 characters')
        .matches(/(?=.*[a-z])/)
        .withMessage('New password must contain at least one lowercase letter')
        .matches(/(?=.*[A-Z])/)
        .withMessage('New password must contain at least one uppercase letter')
        .matches(/(?=.*\d)/)
        .withMessage('New password must contain at least one number')
        .matches(/(?=.*[@$!%*?&])/)
        .withMessage('New password must contain at least one special character (@$!%*?&)'),
    ];
  }

  // Parameter validation rules
  static validateParams() {
    return {
      serviceId: param('serviceId')
        .matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .withMessage('Service ID must be in kebab-case format'),
      
      incidentId: param('incidentId')
        .isUUID()
        .withMessage('Incident ID must be a valid UUID'),
      
      userId: param('userId')
        .isUUID()
        .withMessage('User ID must be a valid UUID'),
      
      updateId: param('updateId')
        .isUUID()
        .withMessage('Update ID must be a valid UUID'),
    };
  }

  // Query parameter validation rules
  static validateQuery() {
    return {
      limit: query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .toInt()
        .withMessage('Limit must be an integer between 1 and 100'),
      
      offset: query('offset')
        .optional()
        .isInt({ min: 0 })
        .toInt()
        .withMessage('Offset must be a non-negative integer'),
      
      months: query('months')
        .optional()
        .isInt({ min: 1, max: 12 })
        .toInt()
        .withMessage('Months must be an integer between 1 and 12'),
      
      days: query('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .toInt()
        .withMessage('Days must be an integer between 1 and 365'),
      
      status: query('status')
        .optional()
        .isIn(['investigating', 'identified', 'monitoring', 'resolved'])
        .withMessage('Status must be one of: investigating, identified, monitoring, resolved'),
      
      severity: query('severity')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('Severity must be one of: low, medium, high, critical'),
      
      startDate: query('startDate')
        .optional()
        .isISO8601()
        .toDate()
        .withMessage('Start date must be a valid ISO8601 date'),
      
      endDate: query('endDate')
        .optional()
        .isISO8601()
        .toDate()
        .withMessage('End date must be a valid ISO8601 date'),
      
      publicOnly: query('publicOnly')
        .optional()
        .isBoolean()
        .toBoolean()
        .withMessage('publicOnly must be a boolean value'),
    };
  }

  // Uptime record validation rules
  static validateUptimeRecord() {
    return [
      body('date')
        .isISO8601()
        .toDate()
        .withMessage('Date must be a valid ISO8601 date'),
      body('status')
        .isIn(['o', 'po', 'mo', 'nd', 'e'])
        .withMessage('Status must be one of: o (operational), po (partial outage), mo (major outage), nd (no data), e (empty)'),
      body('response_time')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Response time must be a positive number'),
      body('error_message')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Error message must be 500 characters or less'),
    ];
  }

  // SLA target validation rules
  static validateSLATargets() {
    return [
      body('uptime')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Uptime target must be a percentage between 0 and 100'),
      body('responseTime')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Response time target must be a positive number in milliseconds'),
      body('errorRate')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Error rate target must be a percentage between 0 and 100'),
    ];
  }

  // Custom sanitization middleware
  static sanitizeInput() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Recursively sanitize strings in request body
      const sanitizeValue = (value: any): any => {
        if (typeof value === 'string') {
          return value.trim()
            .replace(/[<>]/g, '') // Remove potential XSS characters
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
        }
        
        if (Array.isArray(value)) {
          return value.map(sanitizeValue);
        }
        
        if (typeof value === 'object' && value !== null) {
          const sanitized: any = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        
        return value;
      };

      if (req.body) {
        req.body = sanitizeValue(req.body);
      }

      next();
    };
  }

  // File upload validation (for future use)
  static validateFileUpload(options: {
    maxSize?: number;
    allowedTypes?: string[];
    required?: boolean;
  } = {}) {
    return (req: Request, res: Response, next: NextFunction) => {
      const { maxSize = 5 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'], required = false } = options;

      if (!req.file) {
        if (required) {
          return res.status(400).json({
            error: 'File required',
            message: 'A file must be uploaded',
          });
        }
        return next();
      }

      // Check file size
      if (req.file.size > maxSize) {
        return res.status(400).json({
          error: 'File too large',
          message: `File size must be less than ${maxSize / (1024 * 1024)}MB`,
          actualSize: req.file.size,
          maxSize,
        });
      }

      // Check file type
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          message: `Allowed file types: ${allowedTypes.join(', ')}`,
          actualType: req.file.mimetype,
          allowedTypes,
        });
      }

      next();
    };
  }

  // Content-Type validation
  static requireContentType(expectedTypes: string[] = ['application/json']) {
    return (req: Request, res: Response, next: NextFunction) => {
      const contentType = req.headers['content-type'];
      
      if (!contentType) {
        return res.status(400).json({
          error: 'Content-Type required',
          message: 'Content-Type header must be specified',
          expectedTypes,
        });
      }

      const isValidType = expectedTypes.some(type => contentType.includes(type));
      
      if (!isValidType) {
        return res.status(400).json({
          error: 'Invalid Content-Type',
          message: `Content-Type must be one of: ${expectedTypes.join(', ')}`,
          actualType: contentType,
          expectedTypes,
        });
      }

      next();
    };
  }

  // Direct validation methods that return validation results
  static validateIncident(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Title validation
    if (!data.title || typeof data.title !== 'string') {
      errors.push('Title is required and must be a string');
    } else {
      const title = data.title.trim();
      if (title.length < 1 || title.length > 200) {
        errors.push('Title must be between 1 and 200 characters');
      }
    }

    // Description validation (optional)
    if (data.description !== undefined) {
      if (typeof data.description !== 'string') {
        errors.push('Description must be a string');
      } else {
        const description = data.description.trim();
        if (description.length > 2000) {
          errors.push('Description must be 2000 characters or less');
        }
      }
    }

    // Severity validation
    if (!data.severity || typeof data.severity !== 'string') {
      errors.push('Severity is required and must be a string');
    } else if (!['low', 'medium', 'high', 'critical'].includes(data.severity)) {
      errors.push('Severity must be one of: low, medium, high, critical');
    }

    // Affected services validation
    if (!data.affected_services || !Array.isArray(data.affected_services)) {
      errors.push('Affected services is required and must be an array');
    } else if (data.affected_services.length === 0) {
      errors.push('At least one affected service must be specified');
    } else {
      const invalidServices = data.affected_services.filter((id: any) =>
        typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
      );
      if (invalidServices.length > 0) {
        errors.push(`Invalid service IDs: ${invalidServices.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static validateIncidentUpdate(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Title validation (optional)
    if (data.title !== undefined) {
      if (typeof data.title !== 'string') {
        errors.push('Title must be a string');
      } else {
        const title = data.title.trim();
        if (title.length < 1 || title.length > 200) {
          errors.push('Title must be between 1 and 200 characters');
        }
      }
    }

    // Description validation (optional)
    if (data.description !== undefined) {
      if (typeof data.description !== 'string') {
        errors.push('Description must be a string');
      } else {
        const description = data.description.trim();
        if (description.length > 2000) {
          errors.push('Description must be 2000 characters or less');
        }
      }
    }

    // Severity validation (optional)
    if (data.severity !== undefined) {
      if (typeof data.severity !== 'string') {
        errors.push('Severity must be a string');
      } else if (!['low', 'medium', 'high', 'critical'].includes(data.severity)) {
        errors.push('Severity must be one of: low, medium, high, critical');
      }
    }

    // Status validation (optional)
    if (data.status !== undefined) {
      if (typeof data.status !== 'string') {
        errors.push('Status must be a string');
      } else if (!['investigating', 'identified', 'monitoring', 'resolved'].includes(data.status)) {
        errors.push('Status must be one of: investigating, identified, monitoring, resolved');
      }
    }

    // Affected services validation (optional)
    if (data.affected_services !== undefined) {
      if (!Array.isArray(data.affected_services)) {
        errors.push('Affected services must be an array');
      } else if (data.affected_services.length === 0) {
        errors.push('At least one affected service must be specified');
      } else {
        const invalidServices = data.affected_services.filter((id: any) =>
          typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
        );
        if (invalidServices.length > 0) {
          errors.push(`Invalid service IDs: ${invalidServices.join(', ')}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export default ValidationMiddleware;