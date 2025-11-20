import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { validationResult } from 'express-validator';
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
        res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.email)) {
        this.logger.logAuthFailure(req, req.body.email, 'invalid_email');
        res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
        return;
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
      res.status(401).json({
        success: false,
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
        res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
        return;
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
      res.status(401).json({
        success: false,
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
        res.status(400).json({
          success: false,
          message: 'Access token is required',
        });
        return;
      }

      // Logout user
      await AuthService.logout(accessToken);

      const duration = Date.now() - startTime;

      this.logger.logLogout(req, req.user?.userId || 'unknown');

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logLogoutFailure(req, req.user?.userId || 'unknown', error.message || 'logout_failed');
      res.status(500).json({
        success: false,
        message: 'Logout failed',
      });
    }
  }

  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      // Get user profile
      const profile = await AuthService.getUserProfile(req.user!.userId);

      if (!profile) {
        res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
        return;
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
          isActive: profile.isActive,
          lastLogin: profile.lastLoginAt,
          createdAt: profile.createdAt,
        },
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to get profile',
      });
    }
  }

  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

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

      // Update profile
      const updatedProfile = await AuthService.updateUserProfile(
        req.user!.userId,
        req.body
      );

      if (!updatedProfile) {
        res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
        return;
      }

      const duration = Date.now() - startTime;

      this.logger.logProfileUpdate(req, req.user!.userId, req.body);

      res.status(200).json({
        success: true,
        data: {
          id: updatedProfile.id,
          username: updatedProfile.username,
          email: updatedProfile.email,
          role: updatedProfile.role,
        },
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
      });
    }
  }

  public async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

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

      // Change password
      const changeResult = await AuthService.changePassword(
        req.user!.userId,
        req.body.currentPassword,
        req.body.newPassword
      );

      if (!changeResult.success) {
        this.logger.logPasswordChangeFailure(req, req.user!.userId, changeResult.message);
        res.status(400).json({
          success: false,
          message: changeResult.message,
        });
        return;
      }

      const duration = Date.now() - startTime;

      this.logger.logPasswordChangeSuccess(req, req.user!.userId);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logPasswordChangeFailure(req, req.user?.userId || 'unknown', error.message || 'password_change_failed');
      res.status(500).json({
        success: false,
        message: 'Failed to change password',
      });
    }
  }

  public async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

      // Validate email
      if (!req.body.email) {
        res.status(400).json({
          success: false,
          message: 'Email is required',
        });
        return;
      }

      // Request password reset
      await AuthService.requestPasswordReset(req.body.email);

      const duration = Date.now() - startTime;

      this.logger.logPasswordResetRequest(req, req.body.email);

      // Always return success for security (don't reveal if email exists)
      res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to process password reset request',
      });
    }
  }

  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();

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

      // Reset password
      const resetResult = await AuthService.resetPassword({
        email: req.body.email,
        resetToken: req.body.token,
        newPassword: req.body.newPassword,
      });

      if (!resetResult.success) {
        this.logger.logPasswordResetFailure(req, 'unknown', resetResult.message);
        res.status(400).json({
          success: false,
          message: resetResult.message,
        });
        return;
      }

      const duration = Date.now() - startTime;

      this.logger.logPasswordResetSuccess(req, resetResult.userId || 'unknown', 'unknown');

      res.status(200).json({
        success: true,
        message: 'Password reset successful',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      this.logger.logPasswordResetFailure(req, 'unknown', error.message || 'password_reset_failed');
      res.status(500).json({
        success: false,
        message: 'Failed to reset password',
      });
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
        res.status(400).json({
          success: false,
          message: 'Session ID is required',
        });
        return;
      }

      // Revoke session
      await AuthService.revokeSession(req.user!.userId, sessionId);

      const duration = Date.now() - startTime;

      this.logger.logSessionRevoked(req, req.user!.userId, sessionId);

      res.status(200).json({
        success: true,
        message: 'Session revoked successfully',
        timestamp: new Date().toISOString(),
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to revoke session',
      });
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