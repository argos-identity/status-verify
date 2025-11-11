import { Request, Response, NextFunction } from 'express';
import AuthService from '../services/auth-service';

export interface RolePermissions {
  viewer: string[];
  reporter: string[];
  admin: string[];
}

export class RBACMiddleware {
  private static readonly ROLE_PERMISSIONS: RolePermissions = {
    viewer: [
      'read_system_status',
      'read_services',
      'read_uptime',
      'read_incidents',
      'read_sla',
    ],
    reporter: [
      'read_system_status',
      'read_services',
      'read_uptime',
      'read_incidents',
      'read_sla',
      'report_incidents',
      'update_own_incidents',
      'comment_incidents',
    ],
    admin: [
      'read_system_status',
      'read_services',
      'read_uptime',
      'read_incidents',
      'read_sla',
      'report_incidents',
      'update_own_incidents',
      'comment_incidents',
      'manage_incidents',
      'manage_services',
      'manage_users',
      'manage_system',
      'delete_incidents',
      'view_sensitive_data',
    ],
  };

  private static readonly ENDPOINT_PERMISSIONS: Record<string, Record<string, string[]>> = {
    '/api/system-status': {
      'GET': ['read_system_status'],
    },
    '/api/services': {
      'GET': ['read_services'],
      'POST': ['manage_services'],
      'PUT': ['manage_services'],
      'DELETE': ['manage_services'],
    },
    '/api/uptime': {
      'GET': ['read_uptime'],
    },
    '/api/incidents': {
      'GET': ['read_incidents'],
      'POST': ['report_incidents'],
    },
    '/api/incidents/:id': {
      'GET': ['read_incidents'],
      'PUT': ['update_own_incidents', 'manage_incidents'],
      'DELETE': ['manage_incidents'],
    },
    '/api/incidents/:id/updates': {
      'POST': ['comment_incidents'],
      'GET': ['read_incidents'],
    },
    '/api/sla': {
      'GET': ['read_sla'],
    },
    '/api/users': {
      'GET': ['manage_users'],
      'POST': ['manage_users'],
      'PUT': ['manage_users'],
      'DELETE': ['manage_users'],
    },
  };

  static checkPermission(permission: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated to access this resource',
          });
        }

        // Check if user has the required permission
        const hasPermission = await AuthService.hasPermission(req.user.userId, permission);
        
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Access denied',
            message: `Required permission: ${permission}`,
            userRole: req.user.role,
            userPermissions: req.user.permissions,
          });
        }

        next();
      } catch (error) {
        console.error('Permission check error:', error);
        return res.status(500).json({
          error: 'Permission check failed',
          message: 'Unable to verify user permissions',
        });
      }
    };
  }

  static checkAnyPermission(permissions: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated to access this resource',
          });
        }

        // Check if user has any of the required permissions
        for (const permission of permissions) {
          const hasPermission = await AuthService.hasPermission(req.user.userId, permission);
          if (hasPermission) {
            return next();
          }
        }

        return res.status(403).json({
          error: 'Access denied',
          message: `Required permissions: ${permissions.join(' OR ')}`,
          userRole: req.user.role,
          userPermissions: req.user.permissions,
        });
      } catch (error) {
        console.error('Permission check error:', error);
        return res.status(500).json({
          error: 'Permission check failed',
          message: 'Unable to verify user permissions',
        });
      }
    };
  }

  static checkRoleHierarchy(minimumRole: 'viewer' | 'reporter' | 'admin') {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated to access this resource',
          });
        }

        const hasAccess = await AuthService.checkRoleAccess(req.user.userId, minimumRole);
        
        if (!hasAccess) {
          return res.status(403).json({
            error: 'Insufficient role',
            message: `Minimum required role: ${minimumRole}`,
            userRole: req.user.role,
            requiredRole: minimumRole,
          });
        }

        next();
      } catch (error) {
        console.error('Role check error:', error);
        return res.status(500).json({
          error: 'Role check failed',
          message: 'Unable to verify user role',
        });
      }
    };
  }

  static checkResourceOwnership(
    getResourceUserId: (req: Request) => Promise<string | null>
  ) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated to access this resource',
          });
        }

        // Admins can access any resource
        if (req.user.role === 'admin') {
          return next();
        }

        const resourceUserId = await getResourceUserId(req);
        
        if (!resourceUserId) {
          return res.status(404).json({
            error: 'Resource not found',
            message: 'The requested resource does not exist',
          });
        }

        if (resourceUserId !== req.user.userId) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'You can only access your own resources',
            resourceOwner: resourceUserId,
            currentUser: req.user.userId,
          });
        }

        next();
      } catch (error) {
        console.error('Ownership check error:', error);
        return res.status(500).json({
          error: 'Ownership check failed',
          message: 'Unable to verify resource ownership',
        });
      }
    };
  }

  static automaticPermissionCheck() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const method = req.method.toUpperCase();
        const basePath = req.route?.path || req.path;
        
        // Normalize path to match our permission mapping
        const normalizedPath = basePath.replace(/\/:[^/]+/g, '/:id');
        
        const endpointPermissions = this.ENDPOINT_PERMISSIONS[normalizedPath];
        if (!endpointPermissions) {
          // No specific permissions defined, allow access
          return next();
        }

        const requiredPermissions = endpointPermissions[method];
        if (!requiredPermissions || requiredPermissions.length === 0) {
          // No permissions required for this method
          return next();
        }

        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated to access this resource',
          });
        }

        // Check if user has any of the required permissions
        for (const permission of requiredPermissions) {
          const hasPermission = await AuthService.hasPermission(req.user.userId, permission);
          if (hasPermission) {
            return next();
          }
        }

        return res.status(403).json({
          error: 'Access denied',
          message: `Required permissions: ${requiredPermissions.join(' OR ')}`,
          endpoint: `${method} ${normalizedPath}`,
          userRole: req.user.role,
          userPermissions: req.user.permissions,
        });
      } catch (error) {
        console.error('Automatic permission check error:', error);
        return res.status(500).json({
          error: 'Permission check failed',
          message: 'Unable to verify endpoint permissions',
        });
      }
    };
  }

  static checkIncidentAccess(action: 'read' | 'update' | 'delete' | 'comment') {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'User must be authenticated to access incidents',
          });
        }

        const incidentId = req.params.id || req.params.incidentId;
        
        if (!incidentId) {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'Incident ID is required',
          });
        }

        // Define required permissions for each action
        const actionPermissions: Record<string, string[]> = {
          read: ['read_incidents'],
          update: ['update_own_incidents', 'manage_incidents'],
          delete: ['manage_incidents'],
          comment: ['comment_incidents'],
        };

        const requiredPermissions = actionPermissions[action];
        if (!requiredPermissions) {
          return res.status(400).json({
            error: 'Invalid action',
            message: `Unknown incident action: ${action}`,
          });
        }

        // Check if user has admin permissions
        if (req.user.permissions.includes('manage_incidents')) {
          return next();
        }

        // For non-admin users, check if they have the required permission
        const hasPermission = requiredPermissions.some(permission => 
          req.user!.permissions.includes(permission)
        );

        if (!hasPermission) {
          return res.status(403).json({
            error: 'Access denied',
            message: `Required permissions for ${action}: ${requiredPermissions.join(' OR ')}`,
            userPermissions: req.user.permissions,
          });
        }

        // For update actions, verify ownership unless user has manage_incidents
        if (action === 'update' && !req.user.permissions.includes('manage_incidents')) {
          // This would require checking the incident's reporter_id
          // For now, we'll assume this check is done at the service level
        }

        next();
      } catch (error) {
        console.error('Incident access check error:', error);
        return res.status(500).json({
          error: 'Access check failed',
          message: 'Unable to verify incident access',
        });
      }
    };
  }

  static getUserPermissions(role: 'viewer' | 'reporter' | 'admin'): string[] {
    return this.ROLE_PERMISSIONS[role] || [];
  }

  static hasRolePermission(role: 'viewer' | 'reporter' | 'admin', permission: string): boolean {
    const rolePermissions = this.ROLE_PERMISSIONS[role] || [];
    return rolePermissions.includes(permission);
  }

  static validateRoleTransition(
    currentRole: 'viewer' | 'reporter' | 'admin',
    newRole: 'viewer' | 'reporter' | 'admin',
    actorRole: 'viewer' | 'reporter' | 'admin'
  ): { allowed: boolean; reason?: string } {
    // Only admins can change roles
    if (actorRole !== 'admin') {
      return { allowed: false, reason: 'Only administrators can change user roles' };
    }

    // Can't demote yourself (prevent lockout)
    if (currentRole === 'admin' && newRole !== 'admin') {
      return { allowed: false, reason: 'Administrators cannot demote themselves to prevent system lockout' };
    }

    return { allowed: true };
  }

  static requirePermission(permission: string) {
    return this.checkPermission(permission);
  }

  static requireRole(minimumRole: 'viewer' | 'reporter' | 'admin') {
    return this.checkRoleHierarchy(minimumRole);
  }

  static debugPermissions() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.user) {
        console.log('RBAC Debug:', {
          userId: req.user.userId,
          role: req.user.role,
          permissions: req.user.permissions,
          endpoint: `${req.method} ${req.path}`,
          timestamp: new Date().toISOString(),
        });
      }
      next();
    };
  }
}

export default RBACMiddleware;