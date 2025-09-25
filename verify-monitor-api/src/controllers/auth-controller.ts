import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import AuthService from '../services/auth-service';
import validationMiddleware from '../middleware/validation-middleware';
import rbacMiddleware from '../middleware/rbac-middleware';
import authMiddleware from '../middleware/auth-middleware';
import LoggingMiddleware from '../middleware/logging-middleware';
import rateLimit from 'express-rate-limit';

export class AuthController {
  private logger = LoggingMiddleware.authLogger();

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress;
      
      this.logger.logAuthAttempt(req, req.body.email, false, 'password_attempt');

      // Validate request body
      if (!req.body.email || !req.body.password) {
        this.logger.logAuthFailure(req, req.body.email || 'unknown', 'validation_failed');
        return next({
          status: 400,
          message: 'Email and password are required',
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.email)) {
        this.logger.logAuthFailure(req, req.body.email, 'invalid_email');
        return next({
          status: 400,
          message: 'Invalid email format',
        });
      }

      // Attempt login
      const loginResult = await AuthService.login({
        email: req.body.email,
        password: req.body.password,
      });

      const duration = Date.now() - startTime;

      this.logger.logAuthSuccess(req, loginResult.user.id, loginResult.user.role);

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: loginResult.user.id,
            name: loginResult.user.name,
            email: loginResult.user.email,
            role: loginResult.user.role,
            permissions: loginResult.user.permissions,
          },
          tokens: {
            accessToken: loginResult.token,
            refreshToken: loginResult.token, // Use the same token for now
            expiresIn: loginResult.expiresIn,
          },
        },
        message: 'Login successful',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logAuthFailure(req, req.body?.email || 'unknown', error.message || 'system_error');
      next({
        status: 401,
        message: error.message || 'Authentication failed',
      });
    }
  }

  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress;

      // Validate refresh token
      if (!req.body.refreshToken) {
        return next({
          status: 400,
          message: 'Refresh token is required',
        });
      }

      // Refresh tokens
      const refreshResult = await AuthService.refreshToken(req.body.refreshToken);

      const duration = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: {
          tokens: {
            accessToken: refreshResult.token,
            refreshToken: refreshResult.token,
            expiresIn: refreshResult.expiresIn,
          },
        },
        message: 'Token refreshed successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next({
        status: 401,
        message: error.message || 'Token refresh failed',
      });
    }
  }

  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress;

      // Get tokens from request
      const accessToken = req.headers.authorization?.replace('Bearer ', '');
      const refreshToken = req.body.refreshToken;

      if (!accessToken) {
        return next({
          status: 400,
          message: 'Access token is required',
        });
      }

      // Logout user
      const logoutResult = await AuthService.logout(
        accessToken,
        refreshToken,
        req.user?.userId || 'unknown',
        clientIp
      );

      const duration = Date.now() - startTime;
      
      this.logger.logLogout(req.user?.userId || 'unknown', clientIp);

      res.status(200).json({
        success: true,
        message: logoutResult.message,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logLogoutFailure(req.user?.userId || 'unknown', req.ip || 'unknown');
      next(error);
    }
  }

  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      // Get user profile
      const profile = await AuthService.getUserProfile(req.user!.userId);

      if (!profile) {
        return next({
          status: 404,
          message: 'User profile not found',
        });
      }

      const duration = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          permissions: profile.permissions,
          isActive: profile.is_active,
          lastLogin: profile.last_login,
          createdAt: profile.created_at,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next(error);
    }
  }

  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      // Validate request body
      const validationResult = validationMiddleware.validateProfileUpdate(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Update profile
      const updatedProfile = await AuthService.updateUserProfile(
        req.user!.userId,
        req.body
      );

      if (!updatedProfile) {
        return next({
          status: 404,
          message: 'User profile not found',
        });
      }

      const duration = Date.now() - startTime;

      this.logger.logProfileUpdate(req.user!.userId, req.ip || 'unknown');

      res.status(200).json({
        success: true,
        data: {
          id: updatedProfile.id,
          name: updatedProfile.name,
          email: updatedProfile.email,
          role: updatedProfile.role,
          permissions: updatedProfile.permissions,
        },
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next(error);
    }
  }

  public async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress;

      // Validate request body
      const validationResult = validationMiddleware.validatePasswordChange(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Change password
      const changeResult = await AuthService.changePassword(
        req.user!.userId,
        req.body.currentPassword,
        req.body.newPassword,
        clientIp
      );

      if (!changeResult.success) {
        this.logger.logPasswordChangeFailure(req.user!.userId, clientIp);
        return next({
          status: 400,
          message: changeResult.message,
        });
      }

      const duration = Date.now() - startTime;
      
      this.logger.logPasswordChangeSuccess(req.user!.userId, clientIp);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logPasswordChangeFailure(req.user?.userId || 'unknown', req.ip || 'unknown');
      next(error);
    }
  }

  public async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress;

      // Validate email
      if (!req.body.email) {
        return next({
          status: 400,
          message: 'Email is required',
        });
      }

      // Request password reset
      const resetResult = await AuthService.requestPasswordReset(
        req.body.email,
        clientIp,
        req.headers['user-agent'] || 'unknown'
      );

      const duration = Date.now() - startTime;
      
      this.logger.logPasswordResetRequest(req.body.email, clientIp);

      // Always return success for security (don't reveal if email exists)
      res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next(error);
    }
  }

  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const clientIp = req.ip || req.connection.remoteAddress;

      // Validate request body
      const validationResult = validationMiddleware.validatePasswordReset(req.body);
      if (!validationResult.isValid) {
        return next({
          status: 400,
          message: 'Validation failed',
          details: validationResult.errors,
        });
      }

      // Reset password
      const resetResult = await AuthService.resetPassword(
        req.body.token,
        req.body.newPassword,
        clientIp
      );

      if (!resetResult.success) {
        this.logger.logPasswordResetFailure('unknown', clientIp);
        return next({
          status: 400,
          message: resetResult.message,
        });
      }

      const duration = Date.now() - startTime;
      
      this.logger.logPasswordResetSuccess(resetResult.userId!, clientIp);

      res.status(200).json({
        success: true,
        message: 'Password reset successful',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logPasswordResetFailure('unknown', req.ip || 'unknown');
      next(error);
    }
  }

  public async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      // Token is already verified by auth middleware
      const duration = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: {
          userId: req.user!.userId,
          role: req.user!.role,
          permissions: req.user!.permissions,
          valid: true,
        },
        message: 'Token is valid',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next(error);
    }
  }

  public async getActiveSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      // Get active sessions for user
      const sessions = await AuthService.getActiveSessions(req.user!.userId);

      const duration = Date.now() - startTime;

      res.status(200).json({
        success: true,
        data: sessions,
        count: sessions.length,
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next(error);
    }
  }

  public async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      const { sessionId } = req.params;

      if (!sessionId) {
        return next({
          status: 400,
          message: 'Session ID is required',
        });
      }

      // Revoke session
      const revokeResult = await AuthService.revokeSession(
        sessionId,
        req.user!.userId,
        req.ip || 'unknown'
      );

      if (!revokeResult.success) {
        return next({
          status: 404,
          message: 'Session not found or already revoked',
        });
      }

      const duration = Date.now() - startTime;
      
      this.logger.logSessionRevoked(req.user!.userId, sessionId, req.ip || 'unknown');

      res.status(200).json({
        success: true,
        message: 'Session revoked successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Create router with all routes and rate limiting
  public createRouter(): Router {
    const router = Router();

    // Rate limiting for auth endpoints
    const authRateLimit = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // 10 attempts per 15 minutes
      message: {
        error: 'Too many authentication attempts',
        message: 'Please try again later',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    const passwordResetRateLimit = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 password reset requests per hour
      message: {
        error: 'Too many password reset attempts',
        message: 'Please try again later',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Public routes (no authentication required)
    router.post('/login', authRateLimit, this.login.bind(this));
    router.post('/refresh', authRateLimit, this.refreshToken.bind(this));
    router.post('/password-reset/request', passwordResetRateLimit, this.requestPasswordReset.bind(this));
    router.post('/password-reset/confirm', passwordResetRateLimit, this.resetPassword.bind(this));

    // Protected routes (authentication required)
    router.use(authMiddleware.authenticate());
    
    router.post('/logout', this.logout.bind(this));
    router.get('/verify', this.verifyToken.bind(this));
    router.get('/profile', this.getProfile.bind(this));
    router.put('/profile', this.updateProfile.bind(this));
    router.post('/password/change', this.changePassword.bind(this));
    router.get('/sessions', this.getActiveSessions.bind(this));
    router.delete('/sessions/:sessionId', this.revokeSession.bind(this));

    return router;
  }
}

// Create singleton instance
const authController = new AuthController();

export default authController;