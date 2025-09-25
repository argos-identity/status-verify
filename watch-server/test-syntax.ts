// Test syntax
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import winston from 'winston';
import cron from 'node-cron';
import database from './config/database';
import healthMonitor from './monitors/health-monitor';
import metricsService from './services/metrics-service';
import { WATCH_SERVER_CONFIG, validateConfig, createMonitoringInterval } from './config/services';

class WatchServer {
  private app: express.Application;
  private logger!: winston.Logger;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.app = express();
    this.initializeLogger();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeLogger(): void {
    this.logger = winston.createLogger({
      level: WATCH_SERVER_CONFIG.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Add file transport if specified
    if (WATCH_SERVER_CONFIG.logging.file) {
      this.logger.add(new winston.transports.File({
        filename: WATCH_SERVER_CONFIG.logging.file,
        format: winston.format.json()
      }));
    }
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          userAgent: req.get('User-Agent')
        });
      });

      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const dbHealth = await database.healthCheck();
        const monitorStatus = await healthMonitor.getHealthStatus();

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          database: dbHealth.database,
          monitoring: {
            isActive: monitorStatus.isMonitoring,
            services: monitorStatus.serviceStatus
          }
        });
      } catch (error: any) {
        this.logger.error('Health check failed', error);
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    });

    // Manual health check trigger
    this.app.post('/api/health-check', async (req, res) => {
      try {
        this.logger.info('Manual health check triggered');
        const results = await healthMonitor.performHealthChecks();
        const session = await metricsService.createMonitoringSession(results);

        res.json({
          success: true,
          session: session.sessionId,
          timestamp: new Date().toISOString(),
          results: results.map(r => ({
            serviceId: r.serviceId,
            serviceName: r.serviceName,
            status: r.status,
            responseTime: r.responseTime,
            httpStatus: r.httpStatus
          }))
        });
      } catch (error: any) {
        this.logger.error('Manual health check failed', error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get service metrics
    this.app.get('/api/metrics/:serviceId', async (req, res) => {
      try {
        const { serviceId } = req.params;
        const days = parseInt(req.query.days as string) || 30;

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

        const metrics = await metricsService.calculateServiceMetrics(serviceId, startDate, endDate);
        const slaMetrics = await metricsService.getSLAMetrics(serviceId, days);

        res.json({
          serviceId,
          period: { days, start: startDate, end: endDate },
          metrics,
          sla: slaMetrics
        });
      } catch (error: any) {
        this.logger.error(`Failed to get metrics for ${req.params.serviceId}`, error);
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get all services metrics
    this.app.get('/api/metrics', async (req, res) => {
      try {
        const days = parseInt(req.query.days as string) || 30;

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

        const allMetrics = await metricsService.calculateAllServiceMetrics(startDate, endDate);
        const systemSummary = await metricsService.getSystemHealthSummary();

        res.json({
          period: { days, start: startDate, end: endDate },
          system: systemSummary,
          services: allMetrics
        });
      } catch (error: any) {
        this.logger.error('Failed to get all metrics', error);
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get monitoring status
    this.app.get('/api/status', async (req, res) => {
      try {
        const monitorStatus = await healthMonitor.getHealthStatus();
        const systemSummary = await metricsService.getSystemHealthSummary();

        res.json({
          monitoring: {
            isActive: monitorStatus.isMonitoring,
            interval: createMonitoringInterval(),
            lastCheck: systemSummary.lastUpdateTime
          },
          system: systemSummary,
          services: monitorStatus.serviceStatus
        });
      } catch (error: any) {
        this.logger.error('Failed to get status', error);
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        timestamp: new Date().toISOString()
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error in request', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: WATCH_SERVER_CONFIG.nodeEnv === 'production' ? 'Something went wrong' : error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      const configValidation = validateConfig();
      if (!configValidation.isValid) {
        this.logger.error('Configuration validation failed', {
          errors: configValidation.errors
        });
        process.exit(1);
      }

      // Connect to database
      await database.connect();

      // Start health monitoring
      await healthMonitor.startMonitoring();

      // Schedule periodic health checks
      this.scheduleHealthChecks();

      // Schedule daily maintenance
      this.scheduleDailyMaintenance();

      // Start server
      const server = this.app.listen(WATCH_SERVER_CONFIG.port, () => {
        this.logger.info('Watch Server started successfully', {
          port: WATCH_SERVER_CONFIG.port,
          nodeEnv: WATCH_SERVER_CONFIG.nodeEnv,
          monitoringInterval: `${createMonitoringInterval() / 1000}s`,
          servicesCount: Object.keys(WATCH_SERVER_CONFIG.services).length
        });
      });

      // Handle server errors
      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(`Port ${WATCH_SERVER_CONFIG.port} is already in use`);
        } else {
          this.logger.error('Server error', error);
        }
        process.exit(1);
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown(server);

    } catch (error: any) {
      this.logger.error('Failed to start Watch Server', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  private scheduleHealthChecks(): void {
    // Calculate cron expression for monitoring interval
    const intervalSeconds = Math.floor(createMonitoringInterval() / 1000);

    let cronExpression: string;
    if (intervalSeconds >= 60) {
      // For intervals >= 1 minute, run every N minutes
      const minutes = Math.floor(intervalSeconds / 60);
      cronExpression = `*/${minutes} * * * *`;
    } else {
      // For intervals < 1 minute, run every N seconds
      cronExpression = `*/${intervalSeconds} * * * * *`;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      try {
        this.logger.debug('Scheduled health check starting');
        await healthMonitor.performHealthChecks();
      } catch (error: any) {
        this.logger.error('Scheduled health check failed', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.logger.info('Health checks scheduled', {
      cronExpression,
      intervalSeconds,
      timezone: 'UTC'
    });
  }

  private scheduleDailyMaintenance(): void {
    // Run daily maintenance at 2:00 AM UTC
    const maintenanceJob = cron.schedule('0 2 * * *', async () => {
      try {
        this.logger.info('Starting daily maintenance');
        await metricsService.performDailyMaintenance();
        this.logger.info('Daily maintenance completed');
      } catch (error: any) {
        this.logger.error('Daily maintenance failed', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.logger.info('Daily maintenance scheduled for 2:00 AM UTC');
  }

  private setupGracefulShutdown(server: any): void {
    const gracefulShutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Stop accepting new requests
      server.close(async () => {
        try {
          // Stop scheduled jobs
          if (this.cronJob) {
            this.cronJob.stop();
            this.logger.info('Stopped scheduled jobs');
          }

          // Stop health monitoring
          await healthMonitor.stopMonitoring();
          this.logger.info('Stopped health monitoring');

          // Disconnect from database
          await database.disconnect();
          this.logger.info('Disconnected from database');

          this.logger.info('Graceful shutdown completed');
          process.exit(0);

        } catch (error: any) {
          this.logger.error('Error during graceful shutdown', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        this.logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      await gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      this.logger.error('Unhandled Rejection', {
        reason,
        promise
      });
      await gracefulShutdown('unhandledRejection');
    });
  }
}

// Start the server if this file is executed directly
if (require.main === module) {
  const server = new WatchServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default WatchServer;