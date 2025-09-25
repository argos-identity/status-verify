import { Router } from 'express';
import AdminController from '../controllers/admin-controller';
import { AuthMiddleware } from '../middleware/auth-middleware';
import { RBACMiddleware } from '../middleware/rbac-middleware';
import { body, query } from 'express-validator';
import { ValidationMiddleware } from '../middleware/validation-middleware';

const router = Router();
const adminController = new AdminController();

// Apply authentication and admin role requirement to all admin routes
router.use(AuthMiddleware.authenticate());
router.use(RBACMiddleware.requireRole('admin'));

/**
 * GET /api/admin/system/health
 * Get system health and admin capabilities
 */
router.get(
  '/system/health',
  adminController.getSystemHealth
);

/**
 * GET /api/admin/database/stats
 * Get current database statistics
 */
router.get(
  '/database/stats',
  adminController.getDatabaseStats
);

/**
 * GET /api/admin/database/reset/validate
 * Validate if reset can be performed in current environment
 */
router.get(
  '/database/reset/validate',
  adminController.validateResetEnvironment
);

/**
 * POST /api/admin/database/reset-token
 * Generate a reset confirmation token
 */
router.post(
  '/database/reset-token',
  adminController.generateResetToken
);

/**
 * POST /api/admin/database/reset-data
 * Reset database data (excluding users by default)
 */
router.post(
  '/database/reset-data',
  [
    body('preserveUsers')
      .optional()
      .isBoolean()
      .withMessage('preserveUsers must be a boolean'),
    body('reseedServices')
      .optional()
      .isBoolean()
      .withMessage('reseedServices must be a boolean'),
    body('confirmationToken')
      .optional()
      .isString()
      .isLength({ min: 10 })
      .withMessage('confirmationToken must be a string with at least 10 characters'),
    body('confirm')
      .isBoolean()
      .equals('true')
      .withMessage('confirm must be true to proceed with reset'),
  ],
  ValidationMiddleware.handleErrors(),
  adminController.resetData
);

/**
 * POST /api/admin/database/reset-all
 * Reset entire database including users (DANGEROUS)
 */
router.post(
  '/database/reset-all',
  [
    body('confirmationToken')
      .optional()
      .isString()
      .isLength({ min: 10 })
      .withMessage('confirmationToken must be a string with at least 10 characters'),
    body('confirm')
      .isBoolean()
      .equals('true')
      .withMessage('confirm must be true to proceed with reset'),
    body('dangerousConfirm')
      .isBoolean()
      .equals('true')
      .withMessage('dangerousConfirm must be true to proceed with full reset'),
  ],
  ValidationMiddleware.handleErrors(),
  adminController.resetAll
);

export default router;