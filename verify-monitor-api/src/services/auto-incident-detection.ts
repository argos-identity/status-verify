import IncidentService from './incident-service';
import SystemService from './system-service';
import { WatchServerLog, IncidentSeverity, IncidentPriority } from '@prisma/client';
import { prisma } from '../config/database-config';

interface DetectionRule {
  id: string;
  name: string;
  description: string;
  condition: (data: HealthCheckData) => boolean;
  severity: IncidentSeverity;
  cooldownMinutes: number; // Minimum time between incidents for same rule
}

interface HealthCheckData {
  serviceId: string;
  isSuccess: boolean;
  responseTime?: number;
  statusCode?: number;
  errorMessage?: string;
  consecutiveFailures: number;
  averageResponseTime: number; // Last 10 checks
  errorRate: number; // Last hour
}

interface ActiveCooldown {
  ruleId: string;
  serviceId: string;
  lastIncidentTime: Date;
}

export class AutoIncidentDetectionService {
  private activeCooldowns: Map<string, ActiveCooldown> = new Map();
  private systemUserId = 'system-auto-detection';

  // Detection rules configuration
  private detectionRules: DetectionRule[] = [
    {
      id: 'consecutive-failures-critical',
      name: 'Consecutive Failures - Critical',
      description: '5 consecutive failures indicate critical service outage',
      condition: (data) => data.consecutiveFailures >= 5,
      severity: 'critical',
      cooldownMinutes: 30
    },
    {
      id: 'consecutive-failures-high',
      name: 'Consecutive Failures - High',
      description: '3 consecutive failures indicate major service issue',
      condition: (data) => data.consecutiveFailures >= 3,
      severity: 'high',
      cooldownMinutes: 15
    },
    {
      id: 'high-response-time',
      name: 'High Response Time',
      description: 'Average response time exceeds 10 seconds',
      condition: (data) => data.averageResponseTime > 10000,
      severity: 'medium',
      cooldownMinutes: 20
    },
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'Error rate exceeds 50% in the last hour',
      condition: (data) => data.errorRate > 0.5,
      severity: 'high',
      cooldownMinutes: 30
    },
    {
      id: 'service-timeout',
      name: 'Service Timeout',
      description: 'Service response time exceeds 30 seconds',
      condition: (data) => data.responseTime !== undefined && data.responseTime > 30000,
      severity: 'high',
      cooldownMinutes: 15
    },
    // Investigation, identification, and monitoring status rules
    {
      id: 'investigating',
      name: 'Service Under Investigation',
      description: 'Service issues are being investigated',
      condition: (data) => !data.isSuccess && data.consecutiveFailures >= 1,
      severity: 'low',
      cooldownMinutes: 60
    },
    {
      id: 'identified',
      name: 'Issue Identified',
      description: 'Service issue has been identified and solution is being prepared',
      condition: (data) => !data.isSuccess && data.consecutiveFailures >= 2,
      severity: 'medium',
      cooldownMinutes: 45
    },
    {
      id: 'monitoring',
      name: 'Service Under Monitoring',
      description: 'Service is being monitored after issue resolution',
      condition: (data) => data.averageResponseTime > 5000 && data.averageResponseTime <= 10000,
      severity: 'low',
      cooldownMinutes: 30
    }
  ];

  /**
   * Analyzes recent health check data and creates incidents if conditions are met
   */
  async analyzeAndCreateIncidents(serviceId: string, latestCheck: WatchServerLog): Promise<void> {
    try {
      console.log(`🔍 Analyzing health data for service: ${serviceId}`);

      // Gather health check data for analysis
      const healthData = await this.gatherHealthCheckData(serviceId, latestCheck);

      // Check each detection rule
      for (const rule of this.detectionRules) {
        if (this.isRuleInCooldown(rule.id, serviceId)) {
          continue; // Skip if rule is in cooldown period
        }

        if (rule.condition(healthData)) {
          console.log(`🚨 Detection rule triggered: ${rule.name} for service ${serviceId}`);
          await this.createAutoIncident(serviceId, rule, healthData);

          // Set cooldown for this rule and service
          this.setCooldown(rule.id, serviceId);
        }
      }
    } catch (error) {
      console.error(`❌ Error in auto incident detection for service ${serviceId}:`, error);
      // Don't throw - this is a background process
    }
  }

  /**
   * Gathers comprehensive health check data for analysis
   */
  private async gatherHealthCheckData(serviceId: string, latestCheck: WatchServerLog): Promise<HealthCheckData> {
    try {
      // Get recent checks for pattern analysis
      const recentChecks = await prisma.watchServerLog.findMany({
        where: { service_id: serviceId },
        orderBy: { check_time: 'desc' },
        take: 10
      });

      // Get checks from last hour for error rate calculation
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourlyChecks = await prisma.watchServerLog.findMany({
        where: {
          service_id: serviceId,
          check_time: { gte: oneHourAgo }
        }
      });

      // Calculate consecutive failures
      let consecutiveFailures = 0;
      for (const check of recentChecks) {
        if (!check.is_success) {
          consecutiveFailures++;
        } else {
          break; // Stop at first success
        }
      }

      // Calculate average response time from recent successful checks
      const successfulChecks = recentChecks.filter(check =>
        check.is_success && check.response_time !== null
      );
      const averageResponseTime = successfulChecks.length > 0
        ? successfulChecks.reduce((sum, check) => sum + (check.response_time || 0), 0) / successfulChecks.length
        : 0;

      // Calculate error rate from last hour
      const errorRate = hourlyChecks.length > 0
        ? hourlyChecks.filter(check => !check.is_success).length / hourlyChecks.length
        : 0;

      return {
        serviceId,
        isSuccess: latestCheck.is_success,
        responseTime: latestCheck.response_time || undefined,
        statusCode: latestCheck.status_code || undefined,
        errorMessage: latestCheck.error_message || undefined,
        consecutiveFailures,
        averageResponseTime,
        errorRate
      };
    } catch (error) {
      console.error(`Error gathering health check data for service ${serviceId}:`, error);

      // Return minimal data based on latest check
      return {
        serviceId,
        isSuccess: latestCheck.is_success,
        responseTime: latestCheck.response_time || undefined,
        statusCode: latestCheck.status_code || undefined,
        errorMessage: latestCheck.error_message || undefined,
        consecutiveFailures: latestCheck.is_success ? 0 : 1,
        averageResponseTime: latestCheck.response_time || 0,
        errorRate: latestCheck.is_success ? 0 : 1
      };
    }
  }

  /**
   * Creates an automatic incident based on detection rule
   */
  private async createAutoIncident(
    serviceId: string,
    rule: DetectionRule,
    healthData: HealthCheckData
  ): Promise<void> {
    try {
      // Generate incident title and description
      const title = this.generateIncidentTitle(serviceId, rule, healthData);
      const description = this.generateIncidentDescription(serviceId, rule, healthData);

      // Create incident using the incident service
      // Priority is determined by rule severity, not by status type
      const incident = await IncidentService.createIncident({
        title,
        description,
        severity: rule.severity,
        priority: this.getPriorityFromSeverity(rule.severity),
        affected_services: [serviceId],
        reporter_id: undefined // Will use system user
      }, this.systemUserId);

      console.log(`✅ Auto-created incident: ${incident.id} for service ${serviceId}`);

      // Optionally add additional context as an update
      if (healthData.errorMessage) {
        await IncidentService.addIncidentUpdate(incident.id, {
          description: `Detected error: ${healthData.errorMessage}`,
          user_id: this.systemUserId
        });
      }

    } catch (error) {
      console.error(`Error creating auto incident for service ${serviceId}:`, error);
      // Log the error but don't throw - this shouldn't interrupt monitoring
    }
  }

  /**
   * Generates a descriptive incident title
   */
  private generateIncidentTitle(serviceId: string, rule: DetectionRule, healthData: HealthCheckData): string {
    const serviceName = this.getServiceDisplayName(serviceId);

    switch (rule.id) {
      case 'consecutive-failures-critical':
        return `${serviceName} - 심각한 서비스 장애 (${healthData.consecutiveFailures}회 연속 실패)`;
      case 'consecutive-failures-high':
        return `${serviceName} - 서비스 접근 불가 (${healthData.consecutiveFailures}회 연속 실패)`;
      case 'high-response-time':
        return `${serviceName} - 응답 시간 지연 (평균 ${Math.round(healthData.averageResponseTime/1000)}초)`;
      case 'high-error-rate':
        return `${serviceName} - 높은 오류율 (${Math.round(healthData.errorRate * 100)}%)`;
      case 'service-timeout':
        return `${serviceName} - 서비스 응답 시간 초과 (${Math.round((healthData.responseTime || 0)/1000)}초)`;
      default:
        return `${serviceName} - 자동 감지된 서비스 문제`;
    }
  }

  /**
   * Generates a detailed incident description
   */
  private generateIncidentDescription(serviceId: string, rule: DetectionRule, healthData: HealthCheckData): string {
    const serviceName = this.getServiceDisplayName(serviceId);
    const timestamp = new Date().toLocaleString('ko-KR');

    let description = `자동 모니터링 시스템에서 ${serviceName} 서비스에 이상을 감지했습니다.\n\n`;
    description += `감지 시간: ${timestamp}\n`;
    description += `감지 규칙: ${rule.name}\n`;
    description += `규칙 설명: ${rule.description}\n\n`;

    description += `현재 상태:\n`;
    description += `• 서비스 상태: ${healthData.isSuccess ? '정상' : '오류'}\n`;

    if (healthData.responseTime !== undefined) {
      description += `• 응답 시간: ${Math.round(healthData.responseTime)}ms\n`;
    }

    if (healthData.statusCode !== undefined) {
      description += `• HTTP 상태 코드: ${healthData.statusCode}\n`;
    }

    description += `• 연속 실패 횟수: ${healthData.consecutiveFailures}\n`;
    description += `• 평균 응답 시간 (최근 10회): ${Math.round(healthData.averageResponseTime)}ms\n`;
    description += `• 오류율 (최근 1시간): ${Math.round(healthData.errorRate * 100)}%\n\n`;

    if (healthData.errorMessage) {
      description += `오류 메시지:\n${healthData.errorMessage}\n\n`;
    }

    description += `이 인시던트는 자동으로 생성되었습니다. 추가 조사가 필요하며, 해결 후 수동으로 상태를 업데이트해 주세요.`;

    return description;
  }

  /**
   * Maps severity to priority based on new P1-P4 system
   */
  private getPriorityFromSeverity(severity: IncidentSeverity): IncidentPriority {
    const priorityMapping = {
      'critical': 'P1',
      'high': 'P2',
      'medium': 'P3',
      'low': 'P4'
    } as const;
    return priorityMapping[severity] as IncidentPriority;
  }

  /**
   * Gets human-readable service name
   */
  private getServiceDisplayName(serviceId: string): string {
    const serviceNames: Record<string, string> = {
      'id-recognition': 'ID Recognition',
      'face-liveness': 'Face Liveness',
      'id-liveness': 'ID Liveness',
      'face-compare': 'Face Compare',
      'curp-verifier': 'CURP Verifier'
    };

    return serviceNames[serviceId] || serviceId;
  }

  /**
   * Checks if a rule is in cooldown period for a service
   */
  private isRuleInCooldown(ruleId: string, serviceId: string): boolean {
    const key = `${ruleId}:${serviceId}`;
    const cooldown = this.activeCooldowns.get(key);

    if (!cooldown) {
      return false;
    }

    const rule = this.detectionRules.find(r => r.id === ruleId);
    if (!rule) {
      return false;
    }

    const cooldownEndTime = new Date(cooldown.lastIncidentTime.getTime() + (rule.cooldownMinutes * 60 * 1000));
    const now = new Date();

    if (now > cooldownEndTime) {
      // Cooldown expired, remove it
      this.activeCooldowns.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Sets cooldown for a rule and service combination
   */
  private setCooldown(ruleId: string, serviceId: string): void {
    const key = `${ruleId}:${serviceId}`;
    this.activeCooldowns.set(key, {
      ruleId,
      serviceId,
      lastIncidentTime: new Date()
    });
  }

  /**
   * Clears all cooldowns (useful for testing or manual reset)
   */
  public clearCooldowns(): void {
    this.activeCooldowns.clear();
    console.log('🔄 All detection rule cooldowns cleared');
  }

  /**
   * Gets current detection rules configuration
   */
  public getDetectionRules(): DetectionRule[] {
    return [...this.detectionRules];
  }

  /**
   * Manually triggers analysis for a service (useful for testing)
   */
  async manualAnalysis(serviceId: string): Promise<void> {
    try {
      // Get the latest check for this service
      const latestCheck = await prisma.watchServerLog.findFirst({
        where: { service_id: serviceId },
        orderBy: { check_time: 'desc' }
      });

      if (!latestCheck) {
        console.log(`No health check data found for service: ${serviceId}`);
        return;
      }

      await this.analyzeAndCreateIncidents(serviceId, latestCheck);
    } catch (error) {
      console.error(`Error in manual analysis for service ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Health check callback for integration with watch server
   */
  async onHealthCheckComplete(serviceId: string, checkResult: WatchServerLog): Promise<void> {
    // This method will be called by the watch server after each health check
    await this.analyzeAndCreateIncidents(serviceId, checkResult);
  }
}

export default new AutoIncidentDetectionService();