import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Environment schema validation
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3001'),
  HOST: z.string().default('localhost'),
  
  // Database Configuration
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  DB_MAX_CONNECTIONS: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('10'),
  DB_CONNECTION_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default('10000'),
  DB_QUERY_TIMEOUT: z.string().transform(Number).pipe(z.number().min(1000)).default('5000'),
  DB_SLOW_QUERY_THRESHOLD: z.string().transform(Number).pipe(z.number().min(1)).default('100'),
  DB_ENABLE_METRICS: z.string().transform(val => val !== 'false').default('true'),
  
  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ALGORITHM: z.enum(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512']).default('HS256'),
  
  // CORS Configuration
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3002,http://localhost:3005,http://localhost:3006,http://localhost:3001'),
  CORS_CREDENTIALS: z.string().transform(val => val === 'true').default('true'),
  
  // Socket.IO Configuration
  SOCKET_CORS_ORIGINS: z.string().optional(),
  SOCKET_PING_TIMEOUT: z.string().transform(Number).pipe(z.number().min(10000)).default('60000'),
  SOCKET_PING_INTERVAL: z.string().transform(Number).pipe(z.number().min(5000)).default('25000'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().min(60000)).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().min(1)).default('100'),
  RATE_LIMIT_SKIP_SUCCESSFUL: z.string().transform(val => val === 'true').default('false'),
  
  // Security Headers
  HELMET_ENABLED: z.string().transform(val => val !== 'false').default('true'),
  CSP_ENABLED: z.string().transform(val => val === 'true').default('false'),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_FILE: z.string().optional(),
  LOG_MAX_SIZE: z.string().default('20m'),
  LOG_MAX_FILES: z.string().transform(Number).pipe(z.number().min(1)).default('14'),
  LOG_DATE_PATTERN: z.string().default('YYYY-MM-DD'),
  
  // Application Settings
  API_PREFIX: z.string().default('/api'),
  API_VERSION: z.string().default('v1'),
  SWAGGER_ENABLED: z.string().transform(val => val === 'true').default('false'),
  
  // Performance Settings
  REQUEST_SIZE_LIMIT: z.string().default('10mb'),
  URL_ENCODED_LIMIT: z.string().default('10mb'),
  JSON_LIMIT: z.string().default('10mb'),
  COMPRESSION_ENABLED: z.string().transform(val => val !== 'false').default('true'),
  
  // Health Check Configuration
  HEALTH_CHECK_ENABLED: z.string().transform(val => val !== 'false').default('true'),
  HEALTH_CHECK_PATH: z.string().default('/health'),
  
  // Watch Server Configuration (for monitoring)
  WATCH_SERVER_ENABLED: z.string().transform(val => val === 'true').default('false'),
  WATCH_SERVER_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3008'),
  WATCH_SERVER_INTERVAL: z.string().transform(Number).pipe(z.number().min(30000)).default('60000'), // 1 minute
  
  // Incident Management
  INCIDENT_AUTO_RESOLVE_HOURS: z.string().transform(Number).pipe(z.number().min(1)).default('24'),
  INCIDENT_ESCALATION_MINUTES: z.string().transform(Number).pipe(z.number().min(5)).default('30'),
  
  // SLA Configuration
  SLA_CALCULATION_INTERVAL_MINUTES: z.string().transform(Number).pipe(z.number().min(1)).default('5'),
  SLA_RETENTION_DAYS: z.string().transform(Number).pipe(z.number().min(1)).default('365'),
  
  // Admin Configuration
  DEFAULT_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).default('admin123!'),
  SETUP_MODE: z.string().transform(val => val === 'true').default('false'),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Validate and parse environment variables
const parseEnvConfig = (): EnvConfig => {
  try {
    const parsed = envSchema.parse(process.env);
    
    // Additional custom validations
    validateDatabaseUrl(parsed.DATABASE_URL);
    validateJwtSecret(parsed.JWT_SECRET);
    validateCorsOrigins(parsed.ALLOWED_ORIGINS);
    
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      throw new Error(`Environment configuration validation failed:\n${errorMessages.join('\n')}`);
    }
    throw error;
  }
};

// Custom validation functions
const validateDatabaseUrl = (url: string): void => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      throw new Error('Database URL must use postgresql:// or postgres:// protocol');
    }
    if (!parsed.hostname) {
      throw new Error('Database URL must include hostname');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid DATABASE_URL: ${error.message}`);
    }
    throw new Error('Invalid DATABASE_URL format');
  }
};

const validateJwtSecret = (secret: string): void => {
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  
  // Check for common weak secrets
  const weakSecrets = [
    'your-secret-key',
    'my-secret-key',
    'secret',
    'password',
    'admin',
    '123456',
    'test',
    'development',
  ];
  
  if (weakSecrets.some(weak => secret.toLowerCase().includes(weak.toLowerCase()))) {
    console.warn('⚠️ WARNING: JWT_SECRET appears to contain common weak patterns. Use a strong random secret in production.');
  }
};

const validateCorsOrigins = (origins: string): void => {
  const originList = origins.split(',').map(o => o.trim());
  
  for (const origin of originList) {
    if (origin !== '*') {
      try {
        new URL(origin);
      } catch {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
    }
  }
};

// Configuration singleton
let envConfig: EnvConfig | null = null;

export const getEnvConfig = (): EnvConfig => {
  if (!envConfig) {
    envConfig = parseEnvConfig();
  }
  return envConfig;
};

// Helper functions for specific config sections
export const getDatabaseConfig = () => {
  const config = getEnvConfig();
  return {
    url: config.DATABASE_URL,
    maxConnections: config.DB_MAX_CONNECTIONS,
    connectionTimeout: config.DB_CONNECTION_TIMEOUT,
    queryTimeout: config.DB_QUERY_TIMEOUT,
    slowQueryThreshold: config.DB_SLOW_QUERY_THRESHOLD,
    logLevel: config.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error'] as const
      : ['warn', 'error'] as const,
    enableMetrics: config.DB_ENABLE_METRICS,
  };
};

export const getJwtConfig = () => {
  const config = getEnvConfig();
  return {
    secret: config.JWT_SECRET,
    expiresIn: config.JWT_EXPIRES_IN,
    refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN,
    algorithm: config.JWT_ALGORITHM,
  };
};

export const getCorsConfig = () => {
  const config = getEnvConfig();
  return {
    origin: config.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
    credentials: config.CORS_CREDENTIALS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  };
};

export const getSocketConfig = () => {
  const config = getEnvConfig();
  return {
    cors: {
      origin: config.SOCKET_CORS_ORIGINS 
        ? config.SOCKET_CORS_ORIGINS.split(',').map(o => o.trim())
        : config.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: config.SOCKET_PING_TIMEOUT,
    pingInterval: config.SOCKET_PING_INTERVAL,
  };
};

export const getRateLimitConfig = () => {
  const config = getEnvConfig();
  return {
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.RATE_LIMIT_SKIP_SUCCESSFUL,
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
  };
};

export const getSecurityConfig = () => {
  const config = getEnvConfig();
  return {
    helmet: {
      enabled: config.HELMET_ENABLED,
      contentSecurityPolicy: config.CSP_ENABLED,
    },
    requestSizeLimit: config.REQUEST_SIZE_LIMIT,
    urlEncodedLimit: config.URL_ENCODED_LIMIT,
    jsonLimit: config.JSON_LIMIT,
    compression: config.COMPRESSION_ENABLED,
  };
};

export const getLoggingConfig = () => {
  const config = getEnvConfig();
  return {
    level: config.LOG_LEVEL,
    file: config.LOG_FILE,
    maxSize: config.LOG_MAX_SIZE,
    maxFiles: config.LOG_MAX_FILES,
    datePattern: config.LOG_DATE_PATTERN,
  };
};

// Environment helpers
export const isDevelopment = (): boolean => getEnvConfig().NODE_ENV === 'development';
export const isProduction = (): boolean => getEnvConfig().NODE_ENV === 'production';
export const isTest = (): boolean => getEnvConfig().NODE_ENV === 'test';

// Configuration validation on module load
export const validateEnvironment = (): void => {
  try {
    const config = getEnvConfig();
    console.log(`✅ Environment configuration loaded successfully`);
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`   Server: ${config.HOST}:${config.PORT}`);
    console.log(`   Database: ${config.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);
    console.log(`   JWT Algorithm: ${config.JWT_ALGORITHM}`);
    console.log(`   CORS Origins: ${config.ALLOWED_ORIGINS}`);
    
    // Warn about development settings in production
    if (isProduction()) {
      if (config.JWT_SECRET.length < 64) {
        console.warn('⚠️ WARNING: Consider using a longer JWT secret in production (64+ characters)');
      }
      if (config.ALLOWED_ORIGINS.includes('localhost')) {
        console.warn('⚠️ WARNING: localhost origins detected in production environment');
      }
      if (!config.HELMET_ENABLED) {
        console.warn('⚠️ WARNING: Security headers (Helmet) disabled in production');
      }
    }
  } catch (error) {
    console.error('❌ Environment configuration validation failed:', error);
    process.exit(1);
  }
};

// Initialize configuration and validate on import
validateEnvironment();

export default getEnvConfig;