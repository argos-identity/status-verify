import dotenv from 'dotenv';
import { ServiceConfig, WatchServerConfig } from '../types';
import endpointParser from '../utils/endpoint-parser';
import winston from 'winston';

// Load environment variables
dotenv.config();

// Initialize logger for configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

// Parse service endpoints cache
let parsedEndpoints: any = null;
let endpointsLoaded = false;

// Function to load service endpoints asynchronously
async function loadServiceEndpoints() {
  if (endpointsLoaded) {
    return parsedEndpoints;
  }

  try {
    parsedEndpoints = await endpointParser.getServiceEndpointsFromProject();
    logger.info('✅ Successfully loaded service endpoints from file');
  } catch (error: any) {
    logger.warn('⚠️ Could not load service endpoints from file, using environment variables', {
      error: error.message
    });
  }

  endpointsLoaded = true;
  return parsedEndpoints;
}

// Create service URLs mapping
const getServiceUrls = () => {
  if (parsedEndpoints) {
    const urlMap: Record<string, string> = {};
    for (const endpoint of parsedEndpoints.endpoints) {
      switch (endpoint.id) {
        case 'id-recognition':
          urlMap.idRecognition = endpoint.url;
          break;
        case 'face-liveness':
          urlMap.faceLiveness = endpoint.url;
          break;
        case 'id-liveness':
          urlMap.idLiveness = endpoint.url;
          break;
        case 'face-compare':
          urlMap.faceCompare = endpoint.url;
          break;
        case 'curp-verifier':
          urlMap.curpVerifier = endpoint.url;
          break;
      }
    }
    return urlMap;
  }

  // Fallback to environment variables
  return {
    idRecognition: process.env.ID_RECOGNITION_URL || 'https://api.example.com/id-recognition/health',
    faceLiveness: process.env.FACE_LIVENESS_URL || 'https://api.example.com/face-liveness/health',
    idLiveness: process.env.ID_LIVENESS_URL || 'https://api.example.com/id-liveness/health',
    faceCompare: process.env.FACE_COMPARE_URL || 'https://api.example.com/face-compare/health',
    curpVerifier: process.env.CURP_VERIFIER_URL || 'https://api.example.com/curp-verifier/health',
  };
};

export const WATCH_SERVER_CONFIG: WatchServerConfig = {
  port: parseInt(process.env.PORT || '3008', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  monitoring: {
    interval: parseInt(process.env.MONITORING_INTERVAL || '60000', 10), // 1 minute
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '10000', 10),      // 10 seconds
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),       // 1 second
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE,
  },
  services: getServiceUrls(),
  alerts: {
    enabled: process.env.ALERT_ON_FAILURE === 'true',
    onFailure: process.env.ALERT_ON_FAILURE === 'true',
  },
};

// Get API key from parsed endpoints or environment
const getApiKey = (): string => {
  if (parsedEndpoints?.apiKey) {
    return parsedEndpoints.apiKey;
  }
  return process.env.SERVICE_API_KEY || '';
};

// Get auth header name
const getAuthHeader = (): string => {
  if (parsedEndpoints?.apiKey) {
    return 'x-api-key'; // Based on service-endpoint.txt format
  }
  return process.env.SERVICE_AUTH_HEADER || 'Authorization';
};

// Create service configurations dynamically
const createServiceConfigs = (): ServiceConfig[] => {
  const apiKey = getApiKey();
  const authHeader = getAuthHeader();

  const baseHeaders = {
    'User-Agent': 'SLA-Monitor-Watch-Server/1.0',
    'Accept': 'application/json',
    ...(apiKey && {
      [authHeader]: parsedEndpoints?.apiKey ? apiKey : `Bearer ${apiKey}`
    })
  };

  return [
    {
      id: 'id-recognition',
      name: 'ID Recognition',
      url: WATCH_SERVER_CONFIG.services.idRecognition,
      method: 'GET',
      headers: baseHeaders,
      timeout: WATCH_SERVER_CONFIG.monitoring.timeout,
      expectedStatus: [200, 201],
      retryCount: WATCH_SERVER_CONFIG.monitoring.maxRetries,
      retryDelay: WATCH_SERVER_CONFIG.monitoring.retryDelay,
    },
    {
      id: 'face-liveness',
      name: 'Face Liveness',
      url: WATCH_SERVER_CONFIG.services.faceLiveness,
      method: 'GET',
      headers: baseHeaders,
      timeout: WATCH_SERVER_CONFIG.monitoring.timeout,
      expectedStatus: [200, 201],
      retryCount: WATCH_SERVER_CONFIG.monitoring.maxRetries,
      retryDelay: WATCH_SERVER_CONFIG.monitoring.retryDelay,
    },
    {
      id: 'id-liveness',
      name: 'ID Liveness',
      url: WATCH_SERVER_CONFIG.services.idLiveness,
      method: 'GET',
      headers: baseHeaders,
      timeout: WATCH_SERVER_CONFIG.monitoring.timeout,
      expectedStatus: [200, 201],
      retryCount: WATCH_SERVER_CONFIG.monitoring.maxRetries,
      retryDelay: WATCH_SERVER_CONFIG.monitoring.retryDelay,
    },
    {
      id: 'face-compare',
      name: 'Face Compare',
      url: WATCH_SERVER_CONFIG.services.faceCompare,
      method: 'GET',
      headers: baseHeaders,
      timeout: WATCH_SERVER_CONFIG.monitoring.timeout,
      expectedStatus: [200, 201],
      retryCount: WATCH_SERVER_CONFIG.monitoring.maxRetries,
      retryDelay: WATCH_SERVER_CONFIG.monitoring.retryDelay,
    },
    {
      id: 'curp-verifier',
      name: 'CURP Verifier',
      url: WATCH_SERVER_CONFIG.services.curpVerifier,
      method: 'GET',
      headers: baseHeaders,
      timeout: WATCH_SERVER_CONFIG.monitoring.timeout,
      expectedStatus: [200, 201],
      retryCount: WATCH_SERVER_CONFIG.monitoring.maxRetries,
      retryDelay: WATCH_SERVER_CONFIG.monitoring.retryDelay,
    },
  ];
};

// Function to get service configurations (async)
export async function getServiceConfigs(): Promise<ServiceConfig[]> {
  await loadServiceEndpoints();
  return createServiceConfigs();
}

// Service configurations for the 5 services to monitor (sync version for backward compatibility)
export const SERVICE_CONFIGS: ServiceConfig[] = createServiceConfigs();

// Validation function for configuration
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required environment variables
  if (!WATCH_SERVER_CONFIG.databaseUrl) {
    errors.push('DATABASE_URL is required');
  }

  // Validate monitoring intervals
  if (WATCH_SERVER_CONFIG.monitoring.interval < 10000) {
    errors.push('MONITORING_INTERVAL must be at least 10 seconds (10000ms)');
  }

  if (WATCH_SERVER_CONFIG.monitoring.timeout < 1000) {
    errors.push('REQUEST_TIMEOUT must be at least 1 second (1000ms)');
  }

  if (WATCH_SERVER_CONFIG.monitoring.timeout >= WATCH_SERVER_CONFIG.monitoring.interval) {
    errors.push('REQUEST_TIMEOUT must be less than MONITORING_INTERVAL');
  }

  // Validate service URLs
  SERVICE_CONFIGS.forEach((service) => {
    try {
      new URL(service.url);
    } catch {
      errors.push(`Invalid URL for service ${service.name}: ${service.url}`);
    }

    if (service.timeout <= 0) {
      errors.push(`Timeout for service ${service.name} must be positive`);
    }

    if (service.retryCount < 0) {
      errors.push(`Retry count for service ${service.name} must be non-negative`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Get service config by ID
export function getServiceConfig(serviceId: string): ServiceConfig | undefined {
  return SERVICE_CONFIGS.find(config => config.id === serviceId);
}

// Get all service IDs
export function getAllServiceIds(): string[] {
  return SERVICE_CONFIGS.map(config => config.id);
}

// Get all service names
export function getAllServiceNames(): Record<string, string> {
  return SERVICE_CONFIGS.reduce((acc, config) => {
    acc[config.id] = config.name;
    return acc;
  }, {} as Record<string, string>);
}

// Helper function to create monitoring interval in milliseconds
export function createMonitoringInterval(): number {
  return WATCH_SERVER_CONFIG.monitoring.interval;
}

// Helper function to check if detailed logging is enabled
export function isDetailedLoggingEnabled(): boolean {
  return process.env.ENABLE_DETAILED_LOGGING === 'true';
}

// Helper function to check if alerts are enabled
export function areAlertsEnabled(): boolean {
  return WATCH_SERVER_CONFIG.alerts.enabled;
}

// Export configuration for external use
export default WATCH_SERVER_CONFIG;