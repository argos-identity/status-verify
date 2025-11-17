import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Configuration
import { 
  getEnvConfig, 
  getCorsConfig, 
  getRateLimitConfig, 
  getSecurityConfig,
  isDevelopment,
  isProduction 
} from './config/env-config';

// Database
import database from './config/database-config';

// Middleware
import { AuthMiddleware } from './middleware/auth-middleware';
import rbacMiddleware from './middleware/rbac-middleware';
import validationMiddleware from './middleware/validation-middleware';
import errorMiddleware from './middleware/error-middleware';
import loggingMiddleware from './middleware/logging-middleware';

// Socket.IO Configuration
import SocketConfig from './config/socket-config';

// Controllers
import systemController from './controllers/system-controller';
import servicesController from './controllers/services-controller';
import uptimeController from './controllers/uptime-controller';
import incidentsController from './controllers/incidents-controller';
import slaController from './controllers/sla-controller';
import authController from './controllers/auth-controller';

// Admin routes
import adminRoutes from './routes/admin-routes';

// Auto-detection routes
import autoDetectionRoutes from './routes/auto-detection-routes';

export class App {
  public app: Application;
  public server: any;
  public io: SocketIOServer | null = null;
  public socketConfig: SocketConfig | null = null;
  
  private config = getEnvConfig();
  
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.initializeConfiguration();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeSocketIO();
    this.initializeErrorHandling();
  }

  private initializeConfiguration(): void {
    // Trust proxy for rate limiting and security headers
    this.app.set('trust proxy', 1);
    
    // Disable x-powered-by header for security
    this.app.disable('x-powered-by');
    
    // Set view engine (if needed for admin interface)
    this.app.set('view engine', 'ejs');
  }

  private initializeMiddleware(): void {
    const securityConfig = getSecurityConfig();
    const corsConfig = getCorsConfig();
    const rateLimitConfig = getRateLimitConfig();

    // Security middleware
    if (securityConfig.helmet.enabled) {
      this.app.use(helmet({
        contentSecurityPolicy: securityConfig.helmet.contentSecurityPolicy,
        crossOriginEmbedderPolicy: false, // Disable for Socket.IO compatibility
      }));
    }

    // CORS configuration
    this.app.use(cors(corsConfig));

    // Compression middleware
    if (securityConfig.compression) {
      this.app.use(compression());
    }

    // Rate limiting
    const rateLimiter = rateLimit(rateLimitConfig);
    this.app.use(rateLimiter);

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: securityConfig.jsonLimit,
      strict: true,
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: securityConfig.urlEncodedLimit,
    }));

    // Request logging middleware
    this.app.use(loggingMiddleware.requestLogger());

    // Custom middleware for request metadata
    this.app.use((req: Request, res: Response, next) => {
      req.requestTime = new Date().toISOString();
      req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.requestId);
      next();
    });
  }

  private initializeRoutes(): void {
    const apiPrefix = this.config.API_PREFIX;

    // Root welcome route
    this.app.get('/', this.rootHandler.bind(this));

    // Health check endpoint
    if (this.config.HEALTH_CHECK_ENABLED) {
      this.app.get(this.config.HEALTH_CHECK_PATH, this.healthCheckHandler.bind(this));
    }

    // API routes
    this.initializeApiRoutes(apiPrefix);

    // Fallback for undefined routes
    this.app.use('*', this.notFoundHandler.bind(this));
  }

  private initializeApiRoutes(apiPrefix: string): void {
    const apiRouter = express.Router();

    // Mount auto-detection routes BEFORE global auth middleware
    // These routes use their own conditionalApiKeyAuth middleware
    console.log('🔓 Mounting auto-detection routes with API key auth');
    apiRouter.use('/auto-detection', autoDetectionRoutes);

    // Apply conditional authentication middleware to other routes
    // GET requests to public routes are allowed without JWT
    // All other requests require JWT authentication
    console.log('🔐 Applying conditional authentication middleware');
    apiRouter.use(AuthMiddleware.conditionalAuth());

    // All other API routes (using conditional JWT authentication)
    this.initializeAllRoutes(apiRouter);

    // Mount API router
    this.app.use(apiPrefix, apiRouter);
  }

  private initializeAllRoutes(router: express.Router): void {
    // Authentication routes (always public)
    router.use('/auth', authController.createRouter());

    // System status routes
    router.get('/system-status', systemController.getSystemStatus.bind(systemController));
    router.get('/system-metrics', systemController.getSystemMetrics.bind(systemController));
    router.get('/system-health', systemController.getSystemHealth.bind(systemController));
    router.get('/system-alerts', systemController.getSystemAlerts.bind(systemController));
    router.post('/system-alerts/:alertId/acknowledge',
      rbacMiddleware.requirePermission('manage_services'),
      systemController.acknowledgeAlert.bind(systemController)
    );
    router.get('/system-configuration', systemController.getSystemConfiguration.bind(systemController));

    // Incidents routes (GET public, POST/PUT/DELETE protected)
    router.get('/incidents/past', incidentsController.getPastIncidents.bind(incidentsController));
    router.get('/incidents/detail', incidentsController.getAllIncidents.bind(incidentsController));
    router.get('/incidents/by-date', incidentsController.getIncidentsByDate.bind(incidentsController));
    router.use('/incidents', incidentsController.createRouter());

    // Services routes
    router.use('/services', servicesController.createRouter());

    // Uptime routes
    router.use('/uptime', uptimeController.createRouter());

    // SLA routes
    router.use('/sla', slaController.createRouter());

    // Auto-detection routes are mounted separately before global auth middleware
    // See initializeApiRoutes() method

    // Admin routes (always require admin role)
    const adminRouter = express.Router();
    adminRouter.use(rbacMiddleware.requireRole('admin'));
    adminRouter.post('/system-settings', systemController.updateSystemSettings.bind(systemController));

    // Database admin routes
    adminRouter.use('/', adminRoutes);

    router.use('/admin', adminRouter);

    // API documentation (if enabled)
    if (this.config.SWAGGER_ENABLED && isDevelopment()) {
      router.get('/docs', (req: Request, res: Response) => {
        res.json({
          message: 'API Documentation',
          swagger: `${req.protocol}://${req.get('host')}/api-docs`,
          version: this.config.API_VERSION,
        });
      });
    }

    // API info endpoint
    router.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'SLA Monitor API',
        version: this.config.API_VERSION,
        environment: this.config.NODE_ENV,
        timestamp: new Date().toISOString(),
        authentication: {
          policy: 'Conditional - GET requests to public endpoints allowed without JWT',
          publicGetEndpoints: [
            '/api/system-status',
            '/api/services',
            '/api/uptime',
            '/api/incidents',
            '/api/sla/availability',
            '/api/health'
          ],
          protectedMethods: ['POST', 'PUT', 'DELETE'],
          protectedGetEndpoints: ['/api/system-metrics', '/api/system-alerts', '/api/admin/*']
        },
        endpoints: {
          health: this.config.HEALTH_CHECK_PATH,
          auth: `${this.config.API_PREFIX}/auth`,
          system: `${this.config.API_PREFIX}/system-status`,
          services: `${this.config.API_PREFIX}/services`,
          uptime: `${this.config.API_PREFIX}/uptime`,
          incidents: `${this.config.API_PREFIX}/incidents`,
          sla: `${this.config.API_PREFIX}/sla`,
          documentation: this.config.SWAGGER_ENABLED ? `${this.config.API_PREFIX}/docs` : null,
        },
      });
    });
  }

  private initializeSocketIO(): void {
    try {
      this.socketConfig = new SocketConfig(this.server);
      this.io = this.socketConfig.getSocketIOServer();
      console.log('✅ Socket.IO server initialized successfully');
    } catch (error: any) {
      console.error('❌ Failed to initialize Socket.IO:', error.message);
      // Continue without WebSocket support
    }
  }

  private initializeErrorHandling(): void {
    // 404 handler should be before error handler
    this.app.use(this.notFoundHandler.bind(this));
    
    // Global error handler (must be last)
    this.app.use(errorMiddleware.errorHandler());
    
    // Graceful shutdown handlers
    this.setupGracefulShutdown();
  }

  private rootHandler(req: Request, res: Response): void {
    const logger = loggingMiddleware.apiLogger();
    logger.logApiCall(
      req.requestId || 'unknown',
      'GET',
      '/',
      undefined
    );

    res.json({
      message: 'Welcome to SLA Monitor API',
      name: 'SLA Monitor API',
      version: this.config.API_VERSION,
      environment: this.config.NODE_ENV,
      timestamp: new Date().toISOString(),
      endpoints: {
        health: this.config.HEALTH_CHECK_PATH,
        api: this.config.API_PREFIX,
        documentation: this.config.SWAGGER_ENABLED ? `${this.config.API_PREFIX}/docs` : null,
      },
      links: {
        systemStatus: `${this.config.API_PREFIX}/system-status`,
        auth: `${this.config.API_PREFIX}/auth`,
        services: `${this.config.API_PREFIX}/services`,
        uptime: `${this.config.API_PREFIX}/uptime`,
        incidents: `${this.config.API_PREFIX}/incidents`,
        sla: `${this.config.API_PREFIX}/sla`,
      },
    });

    logger.logResponse(
      req.requestId || 'unknown',
      200,
      Date.now() - new Date(req.requestTime || new Date()).getTime(),
      undefined
    );
  }

  private async healthCheckHandler(req: Request, res: Response): Promise<void> {
    try {
      // Check database connection
      const dbHealth = await database.getHealthStatus();
      
      // Check Socket.IO status
      const socketHealth = this.socketConfig ? {
        status: 'healthy',
        connectedUsers: this.socketConfig.getConnectedUsers(),
        activeRooms: this.socketConfig.getActiveRooms(),
      } : {
        status: 'disabled',
        connectedUsers: 0,
        activeRooms: 0,
      };

      // Overall health status
      const isHealthy = dbHealth.connected && (this.socketConfig ? true : true);
      
      const healthData = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: this.config.API_VERSION,
        environment: this.config.NODE_ENV,
        uptime: process.uptime(),
        database: dbHealth,
        websocket: socketHealth,
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
          pid: process.pid,
        },
      };

      res.status(isHealthy ? 200 : 503).json(healthData);
    } catch (error: any) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private notFoundHandler(req: Request, res: Response): void {
    const logger = loggingMiddleware.apiLogger();
    logger.logNotFound(req);
    
    res.status(404).json({
      error: 'Not Found',
      message: `The requested resource ${req.method} ${req.originalUrl} was not found`,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Stop accepting new connections
        this.server.close(async () => {
          console.log('🔌 HTTP server closed');
          
          try {
            // Close Socket.IO connections
            if (this.io) {
              this.io.close(() => {
                console.log('🔌 Socket.IO server closed');
              });
            }
            
            // Close database connections
            await database.disconnect();
            console.log('🔌 Database connections closed');
            
            console.log('✅ Graceful shutdown completed');
            process.exit(0);
          } catch (error: any) {
            console.error('❌ Error during graceful shutdown:', error);
            process.exit(1);
          }
        });

        // Force shutdown after timeout
        setTimeout(() => {
          console.error('⏰ Graceful shutdown timeout reached, forcing exit');
          process.exit(1);
        }, 30000); // 30 seconds timeout

      } catch (error: any) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize database connection
      await database.connect();
      console.log('✅ Database initialized');

      // Run database migrations and seeding
      await database.runMigrations();
      await database.seedDatabase();
      
      console.log('✅ Application initialized successfully');
    } catch (error: any) {
      console.error('❌ Failed to initialize application:', error);
      throw error;
    }
  }

  public listen(): void {
    const port = this.config.PORT;
    const host = this.config.HOST;
    
    this.server.listen(port, host, () => {
      console.log('\n🚀 SLA Monitor API Server Started');
      console.log(`📡 Server: http://${host}:${port}`);
      console.log(`🌍 Environment: ${this.config.NODE_ENV}`);
      console.log(`📊 Health Check: http://${host}:${port}${this.config.HEALTH_CHECK_PATH}`);
      console.log(`🔌 WebSocket: ${this.io ? 'Enabled' : 'Disabled'}`);
      console.log(`📚 API Docs: ${this.config.SWAGGER_ENABLED ? `http://${host}:${port}${this.config.API_PREFIX}/docs` : 'Disabled'}`);
      console.log(`⏰ Started at: ${new Date().toISOString()}\n`);
    });
  }

  public getApp(): Application {
    return this.app;
  }

  public getServer() {
    return this.server;
  }

  public getSocketIO(): SocketIOServer | null {
    return this.io;
  }

  public getSocketConfig(): SocketConfig | null {
    return this.socketConfig;
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestTime?: string;
      requestId?: string;
      user?: {
        userId: string;
        role: string;
        permissions: string[];
      };
    }
  }
}

export default App;