import { Router } from 'express';
import autoDetectionController from '../controllers/auto-detection-controller';

const router = Router();

/**
 * Auto-Detection Routes
 * These routes are used by the watch server to trigger automatic incident detection
 *
 * Note: These endpoints do NOT require JWT authentication as they are internal service calls
 * However, you may want to add API key authentication for production use
 */

/**
 * @route POST /api/auto-detection/analyze
 * @desc Analyze a single service's health check data
 * @access Public (Internal service call)
 * @body { serviceId: string, latestCheckId?: number }
 */
router.post('/analyze', autoDetectionController.analyzeHealthCheck);

/**
 * @route POST /api/auto-detection/batch-analyze
 * @desc Analyze multiple services at once
 * @access Public (Internal service call)
 * @body { serviceIds: string[] }
 */
router.post('/batch-analyze', autoDetectionController.batchAnalyze);

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
 * @access Public (Should be protected in production)
 * @body { serviceId: string }
 */
router.post('/manual-analysis', autoDetectionController.manualAnalysis);

export default router;