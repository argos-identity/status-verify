export const WATCH_SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3008'),
  nodeEnv: process.env.NODE_ENV || 'development',
  monitoring: {
    interval: parseInt(process.env.MONITORING_INTERVAL || '60000'),
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '10000'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE
  }
};

export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function createMonitoringInterval(): number {
  return WATCH_SERVER_CONFIG.monitoring.interval;
}