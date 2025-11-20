import { Request, Response } from 'express';
import AutoIncidentDetectionService from '../services/auto-incident-detection';
import { prisma } from '../config/database-config';
import { getLogger } from '../middleware/logging-middleware';

const logger = getLogger();

/**
 * Auto-Detection Controller
 * Handles automatic incident detection triggered by watch server
 */
class AutoDetectionController {
  /**
   * POST /api/auto-detection/analyze
   * Analyzes health check data and creates incidents if conditions are met
   */
  async analyzeHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId, latestCheckId } = req.body;

      // Validation
      if (!serviceId) {
        res.status(400).json({
          success: false,
          error: 'serviceId is required'
        });
        return;
      }

      logger.info(`🔍 Auto-detection analysis triggered for service: ${serviceId}`);

      // Get latest health check log
      let latestCheck;
      if (latestCheckId) {
        latestCheck = await prisma.watchServerLog.findUnique({
          where: { id: latestCheckId }
        });
      } else {
        // If no ID provided, get the latest check for this service
        latestCheck = await prisma.watchServerLog.findFirst({
          where: { service_id: serviceId },
          orderBy: { check_time: 'desc' }
        });
      }

      if (!latestCheck) {
        res.status(404).json({
          success: false,
          error: 'No health check data found for this service'
        });
        return;
      }

      // Trigger auto-detection analysis
      await AutoIncidentDetectionService.analyzeAndCreateIncidents(serviceId, latestCheck);

      res.status(200).json({
        success: true,
        analyzed: true,
        serviceId,
        checkTime: latestCheck.check_time,
        message: 'Auto-detection analysis completed successfully'
      });

    } catch (error: any) {
      logger.error('❌ Auto-detection analysis failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error during auto-detection analysis',
        message: error.message
      });
    }
  }

  /**
   * POST /api/auto-detection/batch-analyze
   * Analyzes multiple services at once
   */
  async batchAnalyze(req: Request, res: Response): Promise<void> {
    try {
      const { serviceIds } = req.body;

      if (!serviceIds || !Array.isArray(serviceIds) || serviceIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'serviceIds array is required'
        });
        return;
      }

      logger.info(`🔍 Batch auto-detection analysis for ${serviceIds.length} services`);

      const results = [];

      for (const serviceId of serviceIds) {
        try {
          // Get latest check for this service
          const latestCheck = await prisma.watchServerLog.findFirst({
            where: { service_id: serviceId },
            orderBy: { check_time: 'desc' }
          });

          if (latestCheck) {
            await AutoIncidentDetectionService.analyzeAndCreateIncidents(serviceId, latestCheck);
            results.push({
              serviceId,
              analyzed: true,
              checkTime: latestCheck.check_time
            });
          } else {
            results.push({
              serviceId,
              analyzed: false,
              reason: 'No health check data found'
            });
          }
        } catch (error: any) {
          logger.error(`❌ Auto-detection failed for service ${serviceId}`, {
            error: error.message
          });
          results.push({
            serviceId,
            analyzed: false,
            reason: error.message
          });
        }
      }

      res.status(200).json({
        success: true,
        results,
        analyzed: results.filter(r => r.analyzed).length,
        failed: results.filter(r => !r.analyzed).length
      });

    } catch (error: any) {
      logger.error('❌ Batch auto-detection analysis failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error during batch analysis',
        message: error.message
      });
    }
  }

  /**
   * GET /api/auto-detection/rules
   * Returns current detection rules configuration
   */
  async getDetectionRules(req: Request, res: Response): Promise<void> {
    try {
      const rules = AutoIncidentDetectionService.getDetectionRules();

      res.status(200).json({
        success: true,
        rules: rules.map(rule => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          cooldownMinutes: rule.cooldownMinutes
        }))
      });

    } catch (error: any) {
      logger.error('❌ Failed to get detection rules', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/auto-detection/clear-cooldowns
   * Clears all cooldown timers (useful for testing)
   */
  async clearCooldowns(req: Request, res: Response): Promise<void> {
    try {
      AutoIncidentDetectionService.clearCooldowns();

      res.status(200).json({
        success: true,
        message: 'All detection rule cooldowns cleared'
      });

    } catch (error: any) {
      logger.error('❌ Failed to clear cooldowns', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * POST /api/auto-detection/manual-analysis
   * Manually triggers analysis for a service (for testing)
   */
  async manualAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.body;

      if (!serviceId) {
        res.status(400).json({
          success: false,
          error: 'serviceId is required'
        });
        return;
      }

      logger.info(`🔧 Manual auto-detection analysis triggered for service: ${serviceId}`);

      await AutoIncidentDetectionService.manualAnalysis(serviceId);

      res.status(200).json({
        success: true,
        message: 'Manual analysis completed successfully',
        serviceId
      });

    } catch (error: any) {
      logger.error('❌ Manual analysis failed', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error during manual analysis',
        message: error.message
      });
    }
  }
}

export default new AutoDetectionController();