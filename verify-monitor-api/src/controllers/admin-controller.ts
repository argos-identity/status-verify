import { Request, Response } from 'express';
import AdminService from '../services/admin-service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

interface ResetDataRequest {
  preserveUsers?: boolean;
  reseedServices?: boolean;
  confirmationToken?: string;
  confirm?: boolean;
}

class AdminController {
  private adminService: AdminService;

  constructor() {
    this.adminService = new AdminService();
  }

  /**
   * GET /api/admin/database/stats
   * Get current database statistics
   */
  getDatabaseStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stats = await this.adminService.getDatabaseStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to get database stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve database statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * GET /api/admin/database/reset/validate
   * Validate if reset can be performed in current environment
   */
  validateResetEnvironment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validation = this.adminService.validateResetEnvironment();

      res.json({
        success: true,
        data: validation,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to validate reset environment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate reset environment',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * POST /api/admin/database/reset-token
   * Generate a reset confirmation token
   */
  generateResetToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const token = this.adminService.generateResetToken();

      res.json({
        success: true,
        data: {
          token,
          expiresIn: '5 minutes',
          warning: 'This token allows complete database reset. Use with extreme caution.',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to generate reset token:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate reset token',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * POST /api/admin/database/reset-data
   * Reset database data (excluding users by default)
   */
  resetData = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        preserveUsers = true,
        reseedServices = true,
        confirmationToken,
        confirm = false,
      }: ResetDataRequest = req.body;

      // Require explicit confirmation
      if (!confirm) {
        res.status(400).json({
          success: false,
          error: 'Confirmation required',
          message: 'You must set "confirm": true to proceed with database reset',
        });
        return;
      }

      // Get current stats before reset
      const statsBefore = await this.adminService.getDatabaseStats();

      // Perform the reset
      const result = await this.adminService.resetData({
        preserveUsers,
        reseedServices,
        confirmationToken,
      });

      // Log the admin action
      console.log(`🔐 Database reset performed by user: ${req.user?.username} (${req.user?.id})`);
      console.log(`📊 Records before reset: ${statsBefore.totalRecords}`);
      console.log(`🗑️  Records deleted: ${Object.values(result.deletedCounts).reduce((sum, count) => sum + count, 0)}`);

      res.json({
        success: true,
        data: {
          ...result,
          statsBefore,
          performedBy: {
            userId: req.user?.id,
            username: req.user?.username,
          },
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Database reset failed:', error);
      res.status(500).json({
        success: false,
        error: 'Database reset failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * POST /api/admin/database/reset-all
   * Reset entire database including users (dangerous)
   */
  resetAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        confirmationToken,
        confirm = false,
        dangerousConfirm = false,
      }: ResetDataRequest & { dangerousConfirm?: boolean } = req.body;

      // Require double confirmation for full reset
      if (!confirm || !dangerousConfirm) {
        res.status(400).json({
          success: false,
          error: 'Double confirmation required',
          message: 'You must set both "confirm": true and "dangerousConfirm": true to proceed with full database reset',
        });
        return;
      }

      // Additional warning for production
      if (process.env.NODE_ENV === 'production') {
        console.warn(`⚠️  DANGEROUS: Full database reset attempted in production by ${req.user?.username}`);
      }

      // Get current stats before reset
      const statsBefore = await this.adminService.getDatabaseStats();

      // Perform the full reset (including users)
      const result = await this.adminService.resetData({
        preserveUsers: false,
        reseedServices: true,
        confirmationToken,
      });

      // Log the dangerous admin action
      console.log(`🚨 FULL DATABASE RESET performed by user: ${req.user?.username} (${req.user?.id})`);
      console.log(`📊 Records before reset: ${statsBefore.totalRecords}`);
      console.log(`🗑️  All records deleted including users`);

      res.json({
        success: true,
        data: {
          ...result,
          statsBefore,
          warning: 'Full database reset completed. All user accounts have been deleted.',
          performedBy: {
            userId: req.user?.id,
            username: req.user?.username,
          },
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Full database reset failed:', error);
      res.status(500).json({
        success: false,
        error: 'Full database reset failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * GET /api/admin/system/health
   * Get system health and admin capabilities
   */
  getSystemHealth = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stats = await this.adminService.getDatabaseStats();
      const validation = this.adminService.validateResetEnvironment();

      res.json({
        success: true,
        data: {
          database: {
            connected: true,
            totalRecords: stats.totalRecords,
            tables: stats.tables,
          },
          environment: {
            nodeEnv: process.env.NODE_ENV,
            canReset: validation.canReset,
            warnings: validation.warnings,
          },
          admin: {
            currentUser: {
              id: req.user?.id,
              username: req.user?.username,
              role: req.user?.role,
            },
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to get system health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system health',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export default AdminController;