// API client for Backend API communication
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// API logging utility for frontend
class FrontendAPILogger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private sanitizeData(data: any): any {
    if (!data) return data;
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'authorization', 'x-api-key'];
    const sanitized = JSON.parse(JSON.stringify(data));

    const maskSensitiveFields = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      for (const key in obj) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          obj[key] = '***MASKED***';
        } else if (typeof obj[key] === 'object') {
          obj[key] = maskSensitiveFields(obj[key]);
        }
      }
      return obj;
    };

    return maskSensitiveFields(sanitized);
  }

  logAPICall(data: {
    serviceName: string;
    method: string;
    url: string;
    headers?: Record<string, any>;
    requestBody?: any;
    httpStatus?: number;
    responseTime?: number;
    responseData?: any;
    error?: string;
  }): void {
    if (!this.isDevelopment) return;

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.group(`🔍 API 호출 로그 [${data.serviceName}]`);
    console.log(`📝 Request ID: ${requestId}`);
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    console.log(`🌐 Service: ${data.serviceName}`);
    console.log(`🔗 Method: ${data.method}`);
    console.log(`🎯 URL: ${data.url}`);

    if (data.headers) {
      console.log(`📋 Headers:`, this.sanitizeData(data.headers));
    }

    if (data.requestBody) {
      console.log(`📦 Request Body:`, this.sanitizeData(data.requestBody));
    }

    if (data.httpStatus) {
      const statusEmoji = data.httpStatus >= 200 && data.httpStatus < 300 ? '✅' :
                         data.httpStatus >= 400 && data.httpStatus < 500 ? '⚠️' : '❌';
      console.log(`${statusEmoji} HTTP Status: ${data.httpStatus}`);
    }

    if (data.responseTime) {
      console.log(`⏱️ Response Time: ${data.responseTime}ms`);
    }

    if (data.responseData) {
      console.log(`📥 Response Data:`, this.sanitizeData(data.responseData));
    }

    if (data.error) {
      console.error(`❌ Error: ${data.error}`);
    }

    console.groupEnd();
  }

  logAPIRequest(serviceName: string, method: string, url: string, headers?: Record<string, any>, body?: any): string {
    if (!this.isDevelopment) return '';

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.group(`🚀 API 요청 시작 [${serviceName}]`);
    console.log(`📝 Request ID: ${requestId}`);
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    console.log(`🌐 Service: ${serviceName}`);
    console.log(`🔗 Method: ${method}`);
    console.log(`🎯 URL: ${url}`);

    if (headers) {
      console.log(`📋 Headers:`, this.sanitizeData(headers));
    }

    if (body) {
      console.log(`📦 Request Body:`, this.sanitizeData(body));
    }

    console.groupEnd();

    return requestId;
  }

  logAPIResponse(requestId: string, serviceName: string, httpStatus?: number, responseTime?: number, responseData?: any, error?: string): void {
    if (!this.isDevelopment) return;

    const emoji = error ? '❌' : '✅';

    console.group(`${emoji} API 응답 완료 [${serviceName}]`);
    console.log(`📝 Request ID: ${requestId}`);
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);

    if (httpStatus) {
      const statusEmoji = httpStatus >= 200 && httpStatus < 300 ? '✅' :
                         httpStatus >= 400 && httpStatus < 500 ? '⚠️' : '❌';
      console.log(`${statusEmoji} HTTP Status: ${httpStatus}`);
    }

    if (responseTime) {
      console.log(`⏱️ Response Time: ${responseTime}ms`);
    }

    if (responseData) {
      console.log(`📥 Response Data:`, this.sanitizeData(responseData));
    }

    if (error) {
      console.error(`❌ Error: ${error}`);
    }

    console.groupEnd();
  }
}

const frontendAPILogger = new FrontendAPILogger();

interface APIResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Backend API의 실제 응답 구조 (중첩된 구조)
interface BackendAPIResponse<T = any> {
  success: boolean;
  data: T;
  timestamp: string;
  responseTime: string;
}

// Service Status Types
export interface ServiceStatus {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'outage' | 'partial';
  uptime: string; // Changed from uptimePercentage to match API response
  uptimeData: string[]; // Added to match API response
  lastCheck?: string;
  responseTime?: number;
}

export interface UptimeData {
  serviceId: string;
  date: string;
  status: 'o' | 'po' | 'mo' | 'nd' | 'e';
}

export interface SystemStatusResponse {
  overallStatus: 'operational' | 'degraded' | 'outage';
  message?: string;
  services: ServiceStatus[];
  lastUpdated: string;
}

class APIClient {
  private baseURL: string;

  constructor() {
    this.baseURL = API_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    const startTime = Date.now();
    const url = `${this.baseURL}${endpoint}`;
    const method = options.method || 'GET';
    const serviceName = 'Status Verify API';

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // 요청 로깅
    const requestId = frontendAPILogger.logAPIRequest(
      serviceName,
      method,
      url,
      headers,
      options.body ? JSON.parse(options.body as string) : undefined
    );

    try {
      const response = await fetch(url, {
        headers,
        ...options,
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorMessage = `HTTP error! status: ${response.status}`;

        // 에러 응답 로깅
        frontendAPILogger.logAPIResponse(
          requestId,
          serviceName,
          response.status,
          responseTime,
          undefined,
          errorMessage
        );

        // 전체 API 호출 로깅 (에러)
        frontendAPILogger.logAPICall({
          serviceName,
          method,
          url,
          headers,
          requestBody: options.body ? JSON.parse(options.body as string) : undefined,
          httpStatus: response.status,
          responseTime,
          error: errorMessage
        });

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // 성공 응답 로깅
      frontendAPILogger.logAPIResponse(
        requestId,
        serviceName,
        response.status,
        responseTime,
        data
      );

      // 전체 API 호출 로깅 (성공)
      frontendAPILogger.logAPICall({
        serviceName,
        method,
        url,
        headers,
        requestBody: options.body ? JSON.parse(options.body as string) : undefined,
        httpStatus: response.status,
        responseTime,
        responseData: data
      });

      // Backend API가 중첩된 구조로 응답을 보내는 경우 처리
      // { success: true, data: {...}, timestamp: "...", responseTime: "..." }
      // 프론트엔드에서는 data 부분만 필요
      const actualData = data.data || data;
      return { success: true, data: actualData };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 네트워크 에러 로깅
      frontendAPILogger.logAPIResponse(
        requestId,
        serviceName,
        0,
        responseTime,
        undefined,
        errorMessage
      );

      // 전체 API 호출 로깅 (네트워크 에러)
      frontendAPILogger.logAPICall({
        serviceName,
        method,
        url,
        headers,
        requestBody: options.body ? JSON.parse(options.body as string) : undefined,
        httpStatus: 0,
        responseTime,
        error: errorMessage
      });

      console.error('API request failed:', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // System Status API
  async getSystemStatus(): Promise<APIResponse<SystemStatusResponse>> {
    return this.request<SystemStatusResponse>('/system-status');
  }

  // Services API
  async getServices(): Promise<APIResponse<ServiceStatus[]>> {
    return this.request<ServiceStatus[]>('/services');
  }

  async getServiceById(serviceId: string): Promise<APIResponse<ServiceStatus>> {
    return this.request<ServiceStatus>(`/services/${serviceId}`);
  }

  // Uptime Data API
  async getUptimeData(
    serviceId: string,
    days: number = 90
  ): Promise<APIResponse<UptimeData[]>> {
    return this.request<UptimeData[]>(`/uptime/${serviceId}?days=${days}`);
  }

  async getAllUptimeData(days: number = 90): Promise<APIResponse<Record<string, UptimeData[]>>> {
    return this.request<Record<string, UptimeData[]>>(`/uptime?days=${days}`);
  }

  // Health Check
  async getHealthCheck(): Promise<APIResponse<any>> {
    return this.request<any>('/health', { method: 'GET' });
  }

  // Incidents API
  async getIncidents(): Promise<APIResponse<any[]>> {
    return this.request<any[]>('/incidents/detail');
  }

  async getActiveIncidents(): Promise<APIResponse<any[]>> {
    return this.request<any[]>('/incidents/active');
  }

  async getPastIncidents(): Promise<APIResponse<any[]>> {
    return this.request<any[]>('/incidents/past');
  }
}

// Export singleton instance
export const apiClient = new APIClient();
export default apiClient;