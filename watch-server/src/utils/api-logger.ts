import winston from 'winston';

export interface APILogData {
  serviceName: string;
  method: string;
  url: string;
  headers?: Record<string, any>;
  body?: any;
  responseTime?: number;
  httpStatus?: number;
  responseData?: any;
  error?: string;
  timestamp: Date;
  requestId?: string;
}

class APILogger {
  private static instance: APILogger;
  private logger: winston.Logger;

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
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
            })
          )
        }),
        new winston.transports.File({
          filename: 'logs/api-calls.log',
          format: winston.format.json()
        })
      ]
    });
  }

  public static getInstance(): APILogger {
    if (!APILogger.instance) {
      APILogger.instance = new APILogger();
    }
    return APILogger.instance;
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));

    // 민감한 정보 마스킹
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth', 'authorization', 'x-api-key'];

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

  public logAPIRequest(data: Omit<APILogData, 'timestamp' | 'requestId'>): string {
    const requestId = this.generateRequestId();

    this.logger.info(`🚀 API Request Started`, {
      requestId,
      serviceName: data.serviceName,
      method: data.method,
      url: data.url,
      timestamp: new Date().toISOString(),
      type: 'API_REQUEST_START'
    });

    return requestId;
  }

  public logAPIResponse(requestId: string, data: Partial<APILogData>): void {
    const logLevel = data.error ? 'error' : 'info';
    const emoji = data.error ? '❌' : '✅';

    this.logger.log(logLevel, `${emoji} API Request Completed`, {
      requestId,
      serviceName: data.serviceName,
      httpStatus: data.httpStatus,
      responseTime: data.responseTime,
      error: data.error,
      timestamp: new Date().toISOString(),
      type: 'API_REQUEST_END'
    });
  }

  public logAPICall(data: APILogData): void {
    const requestId = data.requestId || this.generateRequestId();

    const logLevel = data.error ? 'error' : 'info';
    const emoji = data.error ? '❌' : '✅';

    this.logger.log(logLevel, `${emoji} API Call`, {
      requestId,
      serviceName: data.serviceName,
      method: data.method,
      url: data.url,
      httpStatus: data.httpStatus,
      responseTime: data.responseTime,
      error: data.error,
      timestamp: data.timestamp.toISOString(),
      type: 'API_CALL_COMPLETE'
    });

    // 추가적인 구조화된 로그 출력
    this.logStructuredAPICall(data);
  }

  private logStructuredAPICall(data: APILogData): void {
    const requestId = data.requestId || this.generateRequestId();

    console.log('\n' + '='.repeat(80));
    console.log(`🔍 API 호출 상세 로그 [${data.serviceName}]`);
    console.log('='.repeat(80));
    console.log(`📝 Request ID: ${requestId}`);
    console.log(`🕐 Timestamp: ${data.timestamp.toISOString()}`);
    console.log(`🌐 Service: ${data.serviceName}`);
    console.log(`🔗 Method: ${data.method}`);
    console.log(`🎯 URL: ${data.url}`);

    if (data.httpStatus) {
      const statusEmoji = data.httpStatus >= 200 && data.httpStatus < 300 ? '✅' : data.httpStatus >= 400 && data.httpStatus < 500 ? '⚠️' : '❌';
      console.log(`${statusEmoji} HTTP Status: ${data.httpStatus}`);
    }

    if (data.responseTime) {
      console.log(`⏱️ Response Time: ${data.responseTime}ms`);
    }

    if (data.error) {
      console.log(`❌ Error: ${data.error}`);
    }

    console.log('='.repeat(80) + '\n');
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getLogger(): winston.Logger {
    return this.logger;
  }
}

const apiLogger = APILogger.getInstance();
export default apiLogger;