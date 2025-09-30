import axios, { AxiosError } from 'axios';
import winston from 'winston';

interface AnalyzeResponse {
  success: boolean;
  analyzed: boolean;
  serviceId: string;
  checkTime: Date;
  message: string;
}

interface BatchAnalyzeResponse {
  success: boolean;
  results: Array<{
    serviceId: string;
    analyzed: boolean;
    checkTime?: Date;
    reason?: string;
  }>;
  analyzed: number;
  failed: number;
}

/**
 * Auto-Detection Client
 * Communicates with verify-monitor-api's auto-detection endpoints
 */
class AutoDetectionClient {
  private static instance: AutoDetectionClient;
  private logger: winston.Logger;
  private monitorApiUrl: string;
  private isEnabled: boolean;
  private timeout: number;

  private constructor() {
    // Initialize logger
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

    // Configuration from environment variables
    this.monitorApiUrl = process.env.MONITOR_API_URL || 'http://localhost:3001';
    this.isEnabled = process.env.ENABLE_AUTO_INCIDENT_DETECTION === 'true';
    this.timeout = parseInt(process.env.AUTO_DETECTION_TIMEOUT || '5000');

    if (this.isEnabled) {
      this.logger.info('🤖 Auto-Detection Client initialized', {
        apiUrl: this.monitorApiUrl,
        timeout: `${this.timeout}ms`
      });
    } else {
      this.logger.info('⏸️  Auto-Detection Client disabled (ENABLE_AUTO_INCIDENT_DETECTION=false)');
    }
  }

  public static getInstance(): AutoDetectionClient {
    if (!AutoDetectionClient.instance) {
      AutoDetectionClient.instance = new AutoDetectionClient();
    }
    return AutoDetectionClient.instance;
  }

  /**
   * Trigger auto-detection analysis for a single service
   */
  public async analyzeSingleService(serviceId: string, latestCheckId?: number): Promise<boolean> {
    if (!this.isEnabled) {
      return false;
    }

    try {
      this.logger.debug(`🔍 Triggering auto-detection for service: ${serviceId}`);

      const response = await axios.post<AnalyzeResponse>(
        `${this.monitorApiUrl}/api/auto-detection/analyze`,
        {
          serviceId,
          latestCheckId
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success && response.data.analyzed) {
        this.logger.info(`✅ Auto-detection completed for ${serviceId}`, {
          checkTime: response.data.checkTime
        });
        return true;
      } else {
        this.logger.warn(`⚠️  Auto-detection analysis returned false for ${serviceId}`);
        return false;
      }

    } catch (error) {
      this.handleError(error, serviceId);
      return false;
    }
  }

  /**
   * Trigger auto-detection analysis for multiple services at once
   */
  public async analyzeBatchServices(serviceIds: string[]): Promise<BatchAnalyzeResponse | null> {
    if (!this.isEnabled) {
      return null;
    }

    if (serviceIds.length === 0) {
      return null;
    }

    try {
      this.logger.debug(`🔍 Triggering batch auto-detection for ${serviceIds.length} services`);

      const response = await axios.post<BatchAnalyzeResponse>(
        `${this.monitorApiUrl}/api/auto-detection/batch-analyze`,
        {
          serviceIds
        },
        {
          timeout: this.timeout * 2, // Double timeout for batch operations
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        this.logger.info(`✅ Batch auto-detection completed`, {
          analyzed: response.data.analyzed,
          failed: response.data.failed
        });
        return response.data;
      } else {
        this.logger.warn(`⚠️  Batch auto-detection returned unsuccessful`);
        return null;
      }

    } catch (error) {
      this.handleError(error, `batch[${serviceIds.length}]`);
      return null;
    }
  }

  /**
   * Trigger auto-detection in the background (fire and forget)
   * This is the recommended method for production use
   */
  public async analyzeInBackground(serviceId: string, latestCheckId?: number): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    // Fire and forget - don't wait for response
    this.analyzeSingleService(serviceId, latestCheckId)
      .catch((error) => {
        // Already logged in analyzeSingleService, just prevent unhandled promise rejection
      });
  }

  /**
   * Trigger batch analysis in the background (fire and forget)
   */
  public async analyzeBatchInBackground(serviceIds: string[]): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    // Fire and forget - don't wait for response
    this.analyzeBatchServices(serviceIds)
      .catch((error) => {
        // Already logged in analyzeBatchServices, just prevent unhandled promise rejection
      });
  }

  /**
   * Check if auto-detection is enabled
   */
  public isAutoDetectionEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Enable auto-detection (for testing)
   */
  public enable(): void {
    this.isEnabled = true;
    this.logger.info('🤖 Auto-Detection Client enabled');
  }

  /**
   * Disable auto-detection (for testing)
   */
  public disable(): void {
    this.isEnabled = false;
    this.logger.info('⏸️  Auto-Detection Client disabled');
  }

  /**
   * Handle errors from auto-detection API calls
   */
  private handleError(error: any, context: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        // Server responded with error status
        this.logger.error(`❌ Auto-detection API error for ${context}`, {
          status: axiosError.response.status,
          data: axiosError.response.data,
          url: axiosError.config?.url
        });
      } else if (axiosError.request) {
        // No response received (timeout or network error)
        this.logger.error(`❌ Auto-detection API no response for ${context}`, {
          code: axiosError.code,
          message: axiosError.message,
          url: axiosError.config?.url
        });
      } else {
        // Error setting up request
        this.logger.error(`❌ Auto-detection API request setup error for ${context}`, {
          message: axiosError.message
        });
      }
    } else {
      // Non-axios error
      this.logger.error(`❌ Auto-detection unexpected error for ${context}`, {
        error: error.message || error,
        stack: error.stack
      });
    }

    // Note: We log errors but don't throw - auto-detection failures should not affect health checks
  }

  /**
   * Get current configuration
   */
  public getConfig(): {
    apiUrl: string;
    isEnabled: boolean;
    timeout: number;
  } {
    return {
      apiUrl: this.monitorApiUrl,
      isEnabled: this.isEnabled,
      timeout: this.timeout
    };
  }
}

// Export singleton instance
const autoDetectionClient = AutoDetectionClient.getInstance();
export default autoDetectionClient;