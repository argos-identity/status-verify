// PRD.md의 데이터베이스 스키마와 API 명세에 기반한 타입 정의

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
  affected_service_names?: string[];
  created_at: string;
  resolved_at?: string | null;
}

export interface IncidentUpdate {
  id: string | number;
  incident_id: string;
  status: IncidentStatus;
  description: string;
  user_id?: string | null;
  created_at: string;
  user?: any;
}

export interface CreateIncidentRequest {
  title: string;
  description: string;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  affected_services: string[];
  reporter: string;
  detection_criteria: string;
}

export interface UpdateIncidentRequest {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
}

export interface CreateIncidentUpdateRequest {
  status: IncidentStatus;
  description: string;
}

// 서비스 목록 (기존 프로젝트와 동일)
export const AVAILABLE_SERVICES = [
  { id: 'id-recognition', name: 'ID Recognition' },
  { id: 'face-liveness', name: 'Face Liveness' },
  { id: 'id-liveness', name: 'ID Liveness' },
  { id: 'face-compare', name: 'Face Compare' },
  { id: 'curp-verifier', name: 'Curp Verifier' },
] as const;

// 상태별 표시 정보
export const STATUS_INFO = {
  investigating: {
    label: '조사 중',
    color: 'var(--color-status-investigating)',
    bgColor: 'rgba(255, 107, 53, 0.1)',
    description: '문제를 조사하고 있습니다'
  },
  identified: {
    label: '원인 식별',
    color: 'var(--color-status-identified)',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    description: '문제의 원인을 식별했습니다'
  },
  monitoring: {
    label: '모니터링',
    color: 'var(--color-status-monitoring)',
    bgColor: 'rgba(33, 150, 243, 0.1)',
    description: '해결책을 적용하고 모니터링 중입니다'
  },
  resolved: {
    label: '해결됨',
    color: 'var(--color-status-resolved)',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    description: '문제가 완전히 해결되었습니다'
  }
} as const;

// 우선순위별 표시 정보
export const PRIORITY_INFO = {
  P1: {
    label: 'P1 - Critical',
    color: 'var(--color-priority-p1)',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    description: '서비스 완전 중단, 즉시 대응 필요'
  },
  P2: {
    label: 'P2 - High',
    color: 'var(--color-priority-p2)',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    description: '주요 기능 장애, 빠른 대응 필요'
  },
  P3: {
    label: 'P3 - Medium',
    color: 'var(--color-priority-p3)',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    description: '부분적 성능 저하, 일반적 대응'
  },
  P4: {
    label: 'P4 - Low',
    color: 'var(--color-priority-p4)',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    description: '경미한 문제, 일반적 처리'
  }
} as const;

// 심각도별 표시 정보
export const SEVERITY_INFO = {
  critical: {
    label: '치명적',
    color: 'var(--color-severity-critical)',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    description: '시스템 전체에 영향을 미치는 치명적 문제'
  },
  high: {
    label: '높음',
    color: 'var(--color-severity-high)',
    bgColor: 'rgba(255, 87, 34, 0.1)',
    description: '주요 기능에 영향을 미치는 심각한 문제'
  },
  medium: {
    label: '중간',
    color: 'var(--color-severity-medium)',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    description: '일부 기능에 영향을 미치는 문제'
  },
  low: {
    label: '낮음',
    color: 'var(--color-severity-low)',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    description: '미미한 영향을 미치는 문제'
  }
} as const;

// 사용자 역할 (PRD.md 권한 시스템)
export type UserRole = 'viewer' | 'reporter' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  created_at: string;
  last_login_at?: string;
  is_active: boolean;
}

// 폼 검증용 타입
export interface IncidentFormData {
  title: string;
  description: string;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  affected_services: string[];
  reporter: string;
  detection_criteria: string;
}

// 필터링용 타입
export interface IncidentFilters {
  status?: IncidentStatus | 'all';
  priority?: IncidentPriority | 'all';
  severity?: IncidentSeverity | 'all';
  affected_service?: string | 'all';
}

// API 응답 타입
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// WebSocket 이벤트 타입 (PRD.md WebSocket 명세)
export interface IncidentEditingEvent {
  incidentId: string;
  userId: string;
  userName: string;
  isEditing: boolean;
  field?: string;
}

export interface IncidentCommentEvent {
  incidentId: string;
  comment: {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: string;
  };
}

export interface AutoSaveEvent {
  incidentId: string;
  data: Partial<Incident>;
  timestamp: string;
}