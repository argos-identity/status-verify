import { Request, Response, NextFunction } from 'express';
import AuthService from '../services/auth-service';

export class AuthMiddleware {
  static authenticate() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'No valid authorization header found',
          });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        if (!token) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'No token provided',
          });
        }

        // Verify token
        const tokenPayload = await AuthService.verifyToken(token);
        
        // Attach user info to request
        req.user = {
          userId: tokenPayload.userId,
          email: tokenPayload.email,
          role: tokenPayload.role,
          permissions: tokenPayload.permissions,
        };

        return next();
      } catch (error: any) {
        console.error('Authentication error:', error);
        
        // Handle specific JWT errors
        if (error.message === 'Token expired') {
          return res.status(401).json({
            error: 'Token expired',
            message: 'Your session has expired. Please login again.',
            code: 'TOKEN_EXPIRED',
          });
        }
        
        if (error.message === 'Invalid token') {
          return res.status(401).json({
            error: 'Invalid token',
            message: 'The provided token is invalid.',
            code: 'TOKEN_INVALID',
          });
        }

        return res.status(401).json({
          error: 'Authentication failed',
          message: error.message || 'Unable to authenticate request',
        });
      }
    };
  }

  static optional() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          if (token) {
            try {
              const tokenPayload = await AuthService.verifyToken(token);
              req.user = {
                userId: tokenPayload.userId,
                email: tokenPayload.email,
                role: tokenPayload.role,
                permissions: tokenPayload.permissions,
              };
            } catch (error) {
              // For optional auth, silently continue without user
              console.warn('Optional auth failed:', error);
            }
          }
        }
        next();
      } catch (error) {
        // For optional auth, always continue
        next();
      }
    };
  }

  static requireRole(requiredRole: 'viewer' | 'reporter' | 'admin') {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be authenticated to access this resource',
        });
      }

      // Role hierarchy: admin > reporter > viewer
      const roleHierarchy = {
        admin: 3,
        reporter: 2,
        viewer: 1,
      };

      const userLevel = roleHierarchy[req.user.role];
      const requiredLevel = roleHierarchy[requiredRole];

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires ${requiredRole} role or higher`,
          required: requiredRole,
          current: req.user.role,
        });
      }

      return next();
    };
  }

  static requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be authenticated to access this resource',
        });
      }

      if (!req.user.permissions.includes(permission)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires the '${permission}' permission`,
          required: permission,
          userPermissions: req.user.permissions,
        });
      }

      return next();
    };
  }

  static requireAnyPermission(permissions: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be authenticated to access this resource',
        });
      }

      const hasPermission = permissions.some(permission =>
        req.user!.permissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `This action requires one of the following permissions: ${permissions.join(', ')}`,
          required: permissions,
          userPermissions: req.user.permissions,
        });
      }

      return next();
    };
  }

  static requireOwnershipOrRole(
    getResourceOwnerId: (req: Request) => Promise<string | null>,
    fallbackRole: 'reporter' | 'admin' = 'admin'
  ) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'You must be authenticated to access this resource',
          });
        }

        // Try to get resource owner ID
        const resourceOwnerId = await getResourceOwnerId(req);
        
        // If user owns the resource, allow access
        if (resourceOwnerId && resourceOwnerId === req.user.userId) {
          return next();
        }

        // Otherwise, check fallback role
        const roleHierarchy = {
          admin: 3,
          reporter: 2,
          viewer: 1,
        };

        const userLevel = roleHierarchy[req.user.role];
        const requiredLevel = roleHierarchy[fallbackRole];

        if (userLevel < requiredLevel) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            message: `You can only access your own resources, or need ${fallbackRole} role or higher`,
            required: fallbackRole,
            current: req.user.role,
          });
        }

        next();
      } catch (error) {
        console.error('Ownership check error:', error);
        return res.status(500).json({
          error: 'Authorization check failed',
          message: 'Unable to verify resource ownership',
        });
      }
    };
  }

  static apiKey() {
    return (req: Request, res: Response, next: NextFunction) => {
      const apiKey = req.headers['x-api-key'] as string;
      const expectedApiKey = process.env.API_KEY;

      if (!expectedApiKey) {
        return res.status(500).json({
          error: 'Server configuration error',
          message: 'API key validation not properly configured',
        });
      }

      if (!apiKey) {
        return res.status(401).json({
          error: 'API key required',
          message: 'X-API-Key header is required',
        });
      }

      if (apiKey !== expectedApiKey) {
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid',
        });
      }

      return next();
    };
  }

  static conditionalAuth() {
    return async (req: Request, res: Response, next: NextFunction) => {
      console.log(`🔍 Checking auth for: ${req.method} ${req.path}`);

      // Public GET endpoints that don't require authentication
      const publicGetRoutes = [
        '/system-status',
        '/services',
        '/uptime',
        '/incidents',
        '/sla/availability',
        '/health'
      ];

      // Public POST endpoints that don't require authentication
      const publicPostRoutes = [
        '/auth/login',
        '/auth/refresh',
        '/auth/password-reset/request',
        '/auth/password-reset/confirm',
        '/auto-detection/analyze',
        '/auto-detection/batch-analyze',
        '/auto-detection/manual-analysis'
      ];

      // Check if this is a GET request to a public route
      if (req.method === 'GET' &&
          publicGetRoutes.some(route => req.path.startsWith(route))) {
        console.log(`✅ Public access allowed: ${req.method} ${req.path}`);
        return next();
      }

      // Check if this is a POST request to a public route
      if (req.method === 'POST' &&
          publicPostRoutes.some(route => req.path.startsWith(route))) {
        console.log(`✅ Public access allowed: ${req.method} ${req.path}`);
        return next();
      }

      console.log(`🔐 Authentication required for: ${req.method} ${req.path}`);
      // For all other requests (POST/PUT/DELETE or protected GET routes), require authentication
      return AuthMiddleware.authenticate()(req, res, next);
    };
  }

  static rateLimit(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction) => {
      const clientId = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      
      // Clean up old entries
      for (const [key, value] of requests.entries()) {
        if (now > value.resetTime) {
          requests.delete(key);
        }
      }

      const clientData = requests.get(clientId);
      
      if (!clientData) {
        // First request from this client
        requests.set(clientId, {
          count: 1,
          resetTime: now + windowMs,
        });
        return next();
      }

      if (now > clientData.resetTime) {
        // Reset window
        requests.set(clientId, {
          count: 1,
          resetTime: now + windowMs,
        });
        return next();
      }

      if (clientData.count >= maxRequests) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Maximum ${maxRequests} requests per ${windowMs / 1000} seconds`,
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
        });
      }

      // Increment count
      clientData.count++;
      next();
    };
  }
}

export default AuthMiddleware;