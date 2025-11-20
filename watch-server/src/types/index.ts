// Health check result types
export interface HealthCheckResult {
  serviceId: string;
  url: string;
  status: 'operational' | 'degraded' | 'down';
  httpStatus: number;
  responseTime: number;
  timestamp: Date;
  error?: string;
  response?: any;
}

export interface ServiceHealthResult {
  serviceId: string;
  serviceName: string;
  url: string;
  status: 'operational' | 'degraded' | 'down';
  httpStatus: number;
  responseTime: number;
  timestamp: Date;
  error?: string;
  response?: any;
  metadata?: {
    version?: string;
    region?: string;
    [key: string]: any;
  };
}

// Service configuration
export interface ServiceConfig {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  timeout: number;
  expectedStatus?: number[];
  retryCount: number;
  retryDelay: number;
}

// Monitoring configuration
export interface MonitoringConfig {
  interval: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  services: ServiceConfig[];
}

// Database record types (matching Prisma models)
export interface UptimeRecordData {
  id?: string;
  service_id: string;
  timestamp: Date;
  status: 'operational' | 'degraded' | 'down';
  response_time: number;
  http_status: number;
  error_message?: string;
  metadata?: any;
}

export interface APIResponseTimeData {
  id?: string;
  service_id: string;
  endpoint: string;
  response_time: number;
  timestamp: Date;
  status_code: number;
  method: string;
  user_agent?: string;
  ip_address?: string;
}

export interface WatchServerLogData {
  id?: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: any;
  timestamp: Date;
  service_id?: string;
  error_stack?: string;
}

// Metrics aggregation types
export interface ServiceMetrics {
  serviceId: string;
  uptime: number; // percentage
  avgResponseTime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastCheck: Date;
  status: 'operational' | 'degraded' | 'down';
}

export interface MonitoringSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  totalServices: number;
  successfulChecks: number;
  failedChecks: number;
  avgResponseTime: number;
  results: ServiceHealthResult[];
}

// Alert types
export interface Alert {
  id: string;
  serviceId: string;
  serviceName: string;
  type: 'downtime' | 'slow_response' | 'error_rate' | 'sla_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  metadata?: any;
}

// Environment configuration
export interface WatchServerConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  monitoring: {
    interval: number;
    timeout: number;
    maxRetries: number;
    retryDelay: number;
  };
  logging: {
    level: string;
    file?: string;
  };
  services: {
    idRecognition: string;
    faceLiveness: string;
    idLiveness: string;
    faceCompare: string;
    curpVerifier: string;
  };
  alerts: {
    enabled: boolean;
    onFailure: boolean;
  };
}

// HTTP client types
export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  timeout: number;
  data?: any;
  validateStatus?: (status: number) => boolean;
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: HttpRequestConfig;
  duration: number;
}

// Error types
export class HealthCheckError extends Error {
  constructor(
    message: string,
    public serviceId: string,
    public httpStatus?: number,
    public responseTime?: number
  ) {
    super(message);
    this.name = 'HealthCheckError';
  }
}

export class ServiceConfigError extends Error {
  constructor(message: string, public serviceId: string) {
    super(message);
    this.name = 'ServiceConfigError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public operation: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Utility types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ServiceStatus = 'operational' | 'degraded' | 'down';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// Export all types as a namespace for easier imports
export namespace Types {
  export type HealthCheckResult = import('./index').HealthCheckResult;
  export type ServiceHealthResult = import('./index').ServiceHealthResult;
  export type ServiceConfig = import('./index').ServiceConfig;
  export type MonitoringConfig = import('./index').MonitoringConfig;
  export type UptimeRecordData = import('./index').UptimeRecordData;
  export type APIResponseTimeData = import('./index').APIResponseTimeData;
  export type WatchServerLogData = import('./index').WatchServerLogData;
  export type ServiceMetrics = import('./index').ServiceMetrics;
  export type MonitoringSession = import('./index').MonitoringSession;
  export type Alert = import('./index').Alert;
  export type WatchServerConfig = import('./index').WatchServerConfig;
  export type HttpRequestConfig = import('./index').HttpRequestConfig;
  export type HttpResponse<T> = import('./index').HttpResponse<T>;
}