import axios from 'axios';
import winston from 'winston';
import { ServiceHealthResult } from '../types';
import apiLogger from '../utils/api-logger';
import { getServiceConfigs } from '../test-data/health-check-data';
import metricsService from '../services/metrics-service-simple';
import autoDetectionClient from '../services/auto-detection-client';
import serviceInitializer from '../services/service-initializer';

const SAMPLE_PAYLOAD_REJECTED = [400, 422];

const isServiceUp = (httpStatus: number): boolean =>
  (httpStatus >= 200 && httpStatus < 300) || SAMPLE_PAYLOAD_REJECTED.includes(httpStatus);

class HealthMonitor {
  private static instance: HealthMonitor;
  private logger: winston.Logger;
  private isMonitoring: boolean = false;

  private constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
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
  }

  public static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  public async startMonitoring(): Promise<void> {
    this.isMonitoring = true;
    this.logger.info('✅ Health monitoring started');
  }

  public async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
    this.logger.info('⏹️ Health monitoring stopped');
  }

  public async performHealthChecks(): Promise<ServiceHealthResult[]> {
    this.logger.info('🔍 Starting health checks...');

    // Get service configurations with correct API request bodies
    const services = getServiceConfigs();

    const results: ServiceHealthResult[] = [];

    for (const service of services) {
      const startTime = Date.now();
      let requestId: string;

      try {
        const requestHeaders = {
          'Content-Type': 'application/json',
          [process.env.SERVICE_AUTH_HEADER || 'x-api-key']: process.env.SERVICE_API_KEY || ''
        };

        // API 요청 시작 로깅
        requestId = apiLogger.logAPIRequest({
          serviceName: service.name,
          method: 'POST',
          url: service.url,
          headers: requestHeaders,
          body: service.healthBody
        });

        this.logger.debug(`🔍 Testing ${service.name} with correct API parameters for ${service.id}...`);

        const response = await axios.post(service.url, service.healthBody, {
          timeout: parseInt(process.env.REQUEST_TIMEOUT || '10000'),
          headers: requestHeaders
        });

        const responseTime = Date.now() - startTime;

        // API 응답 성공 로깅
        apiLogger.logAPIResponse(requestId, {
          serviceName: service.name,
          httpStatus: response.status,
          responseTime,
          responseData: response.data
        });

        // 전체 API 호출 로깅
        apiLogger.logAPICall({
          serviceName: service.name,
          method: 'POST',
          url: service.url,
          headers: requestHeaders,
          body: service.healthBody,
          httpStatus: response.status,
          responseTime,
          responseData: response.data,
          timestamp: new Date(),
          requestId
        });

        results.push({
          serviceId: service.id,
          serviceName: service.name,
          url: service.url,
          status: isServiceUp(response.status) ? 'operational' : 'down',
          httpStatus: response.status,
          responseTime,
          timestamp: new Date()
        });

        this.logger.info(`✅ ${service.name}: ${response.status} (${responseTime}ms) - POST with correct API parameters`);

      } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const httpStatus = error.response?.status || 0;

        // API 응답 실패 로깅
        apiLogger.logAPIResponse(requestId!, {
          serviceName: service.name,
          httpStatus,
          responseTime,
          responseData: error.response?.data,
          error: error.message
        });

        // 전체 API 호출 로깅 (에러 포함)
        apiLogger.logAPICall({
          serviceName: service.name,
          method: 'POST',
          url: service.url,
          headers: {
            'Content-Type': 'application/json',
            [process.env.SERVICE_AUTH_HEADER || 'x-api-key']: process.env.SERVICE_API_KEY || ''
          },
          body: service.healthBody,
          httpStatus,
          responseTime,
          responseData: error.response?.data,
          error: error.message,
          timestamp: new Date(),
          requestId: requestId!
        });

        const serviceUp = isServiceUp(httpStatus);

        results.push({
          serviceId: service.id,
          serviceName: service.name,
          url: service.url,
          status: serviceUp ? 'operational' : 'down',
          httpStatus,
          responseTime,
          timestamp: new Date(),
          error: serviceUp ? 'Service operational (sample payload rejected)' : error.message
        });

        if (serviceUp) {
          this.logger.info(`✅ ${service.name}: ${httpStatus} (${responseTime}ms) - Service operational, sample payload rejected`);
        } else {
          this.logger.error(`❌ ${service.name} failed:`, {
            url: service.url,
            method: 'POST',
            status: httpStatus,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers,
            message: error.message,
            code: error.code,
            responseTime
          });
        }
      }
    }

    this.logger.info(`🔍 Health checks completed: ${results.length} services checked`);

    // Save results to database using MetricsService
    try {
      await metricsService.createMonitoringSession(results);
      this.logger.info(`💾 Health check results saved to database successfully`);
    } catch (error: any) {
      this.logger.error('❌ Failed to save health check results to database', {
        error: error.message,
        resultsCount: results.length
      });
      // Don't throw error here - we want to continue monitoring even if DB save fails
    }

    // Trigger auto-detection analysis for all services (in background)
    if (autoDetectionClient.isAutoDetectionEnabled()) {
      this.logger.debug('🤖 Triggering auto-detection analysis...');

      // Extract service IDs from results
      const serviceIds = results.map(r => r.serviceId);

      // Fire and forget - don't wait for auto-detection to complete
      autoDetectionClient.analyzeBatchInBackground(serviceIds)
        .catch((error) => {
          // Error already logged in client, just prevent unhandled promise rejection
        });

      this.logger.debug(`🤖 Auto-detection triggered for ${serviceIds.length} services`);
    }

    return results;
  }

  public async getHealthStatus(): Promise<{
    isMonitoring: boolean;
    serviceStatus: any[];
  }> {
    return {
      isMonitoring: this.isMonitoring,
      serviceStatus: await serviceInitializer.getServiceHealth()
    };
  }
}

const healthMonitor = HealthMonitor.getInstance();
export default healthMonitor;