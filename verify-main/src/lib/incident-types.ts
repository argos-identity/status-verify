// Incident types for system status monitoring
// Shared types between verify-main and verify-uptime

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface Incident {
  id: string;
  title: string;
  description?: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  reporter?: string;
  detection_criteria?: string;
  affected_services: string[];
  created_at: string;
  resolved_at?: string;
  updates?: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  status: IncidentStatus;
  description: string;
  created_at: string;
}

// Service list (consistent with other apps)
export const AVAILABLE_SERVICES = [
  { id: 'id-recognition', name: 'ID Recognition' },
  { id: 'face-liveness', name: 'Face Liveness' },
  { id: 'id-liveness', name: 'ID Liveness' },
  { id: 'face-compare', name: 'Face Compare' },
  { id: 'curp-verifier', name: 'Curp Verifier' },
] as const;

// Status display information
export const STATUS_INFO = {
  investigating: {
    label: '조사 중',
    color: '#FF6B35',
    bgColor: 'rgba(255, 107, 53, 0.1)',
    description: '문제를 조사하고 있습니다'
  },
  identified: {
    label: '원인 식별',
    color: '#FF9800',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    description: '문제의 원인을 식별했습니다'
  },
  monitoring: {
    label: '모니터링',
    color: '#2196F3',
    bgColor: 'rgba(33, 150, 243, 0.1)',
    description: '해결책을 적용하고 모니터링 중입니다'
  },
  resolved: {
    label: '해결됨',
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    description: '문제가 완전히 해결되었습니다'
  }
} as const;

// Priority display information
export const PRIORITY_INFO = {
  P1: {
    label: 'P1 - Critical',
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    description: '서비스 완전 중단, 즉시 대응 필요'
  },
  P2: {
    label: 'P2 - High',
    color: '#FF9800',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    description: '주요 기능 장애, 빠른 대응 필요'
  },
  P3: {
    label: 'P3 - Medium',
    color: '#FFC107',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    description: '부분적 성능 저하, 일반적 대응'
  },
  P4: {
    label: 'P4 - Low',
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    description: '경미한 문제, 일반적 처리'
  }
} as const;

// Severity display information
export const SEVERITY_INFO = {
  critical: {
    label: '치명적',
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    description: '시스템 전체에 영향을 미치는 치명적 문제'
  },
  high: {
    label: '높음',
    color: '#FF5722',
    bgColor: 'rgba(255, 87, 34, 0.1)',
    description: '주요 기능에 영향을 미치는 심각한 문제'
  },
  medium: {
    label: '중간',
    color: '#FF9800',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    description: '일부 기능에 영향을 미치는 문제'
  },
  low: {
    label: '낮음',
    color: '#FFC107',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    description: '미미한 영향을 미치는 문제'
  }
} as const;

// Group incidents by date for display
export interface IncidentDay {
  date: string;
  incidents: Incident[];
}