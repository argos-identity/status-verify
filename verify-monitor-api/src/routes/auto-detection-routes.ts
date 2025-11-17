import { Router } from 'express';
import autoDetectionController from '../controllers/auto-detection-controller';
import { AuthMiddleware } from '../middleware/auth-middleware';

const router = Router();

/**
 * Auto-Detection Routes
 * These routes are used by the watch server to trigger automatic incident detection
 *
 * Authentication Strategy:
 * - Development: Public access (no authentication required)
 * - Production: API key authentication via X-API-Key header
 */

// Conditional authentication: API key in production, public in development
// PRODUCTION MODE: API key authentication enabled
// IMPORTANT: Set API_KEY in .env file for production deployment
const conditionalApiKeyAuth = process.env.NODE_ENV === 'production'
  ? AuthMiddleware.apiKey()
  : (_req: any, _res: any, next: any) => {
      console.log('🔓 Auto-detection endpoint accessed in development mode (no auth required)');
      next();
    };

/**
 * @route POST /api/auto-detection/analyze
 * @desc Analyze a single service's health check data
 * @access Public in dev, API key required in production
 * @body { serviceId: string, latestCheckId?: number }
 */
router.post('/analyze', conditionalApiKeyAuth, autoDetectionController.analyzeHealthCheck);

/**
 * @route POST /api/auto-detection/batch-analyze
 * @desc Analyze multiple services at once
 * @access Public in dev, API key required in production
 * @body { serviceIds: string[] }
 */
router.post('/batch-analyze', conditionalApiKeyAuth, autoDetectionController.batchAnalyze);

/**
 * @route GET /api/auto-detection/rules
 * @desc Get current detection rules configuration
 * @access Public
 */
router.get('/rules', autoDetectionController.getDetectionRules);

/**
 * @route POST /api/auto-detection/clear-cooldowns
 * @desc Clear all cooldown timers (for testing)
 * @access Public (Should be protected in production)
 */
router.post('/clear-cooldowns', autoDetectionController.clearCooldowns);

/**
 * @route POST /api/auto-detection/manual-analysis
 * @desc Manually trigger analysis for a service (for testing)
 * @access Public in dev, API key required in production
 * @body { serviceId: string }
 */
router.post('/manual-analysis', conditionalApiKeyAuth, autoDetectionController.manualAnalysis);

export default router;