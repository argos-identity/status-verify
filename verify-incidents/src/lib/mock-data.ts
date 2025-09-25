import type { Incident, IncidentUpdate } from './types'

// Mock Incidents 데이터 - PRD.md 예시와 실제적인 시나리오를 기반으로 생성
export const mockIncidents: Incident[] = [
  {
    id: 'inc-2025-001',
    title: 'ID Recognition 서비스 응답 지연',
    description: 'ID Recognition 서비스에서 응답 시간이 평균 15초 이상 지연되고 있습니다. 데이터베이스 연결 풀 부족으로 추정됩니다.',
    status: 'monitoring',
    severity: 'high',
    priority: 'P2',
    reporter: '모니터링 시스템',
    detection_criteria: '연속 3회 7초 초과 응답시간 감지',
    affected_services: ['id-recognition', 'face-liveness'],
    created_at: '2025-09-01T09:30:00Z',
    resolved_at: undefined
  },
  {
    id: 'inc-2025-002',
    title: 'Face Compare API 간헐적 타임아웃',
    description: 'Face Compare API에서 간헐적으로 타임아웃이 발생하고 있습니다. 피크 시간대에 주로 발생하는 것으로 보입니다.',
    status: 'investigating',
    severity: 'medium',
    priority: 'P2',
    reporter: '운영팀 - 김민수',
    detection_criteria: '시간당 5회 이상 타임아웃 발생',
    affected_services: ['face-compare'],
    created_at: '2025-09-01T10:15:00Z',
    resolved_at: undefined
  },
  {
    id: 'inc-2025-003',
    title: 'Curp Verifier 서비스 완전 중단',
    description: 'Curp Verifier 서비스가 완전히 중단되었습니다. 외부 API 연결 실패로 인한 것으로 추정됩니다.',
    status: 'identified',
    severity: 'critical',
    priority: 'P1',
    reporter: '모니터링 시스템',
    detection_criteria: '연속 10회 연결 실패',
    affected_services: ['curp-verifier'],
    created_at: '2025-09-01T11:45:00Z',
    resolved_at: undefined
  },
  {
    id: 'inc-2025-004',
    title: 'ID Liveness 성능 저하',
    description: 'ID Liveness 서비스의 처리 속도가 평소 대비 30% 감소했습니다.',
    status: 'resolved',
    severity: 'medium',
    priority: 'P3',
    reporter: '운영팀 - 이영희',
    detection_criteria: '평균 응답시간 30% 증가',
    affected_services: ['id-liveness'],
    created_at: '2025-08-31T14:20:00Z',
    resolved_at: '2025-08-31T16:45:00Z'
  },
  {
    id: 'inc-2025-005',
    title: '모든 서비스 동시 부하 증가',
    description: '모든 인증 서비스에서 동시에 부하가 증가하고 있습니다. 대량의 요청이 유입되고 있는 것으로 보입니다.',
    status: 'investigating',
    severity: 'critical',
    priority: 'P1',
    reporter: '모니터링 시스템',
    detection_criteria: '전체 서비스 동시 부하 200% 증가',
    affected_services: ['id-recognition', 'face-liveness', 'id-liveness', 'face-compare', 'curp-verifier'],
    created_at: '2025-09-01T12:00:00Z',
    resolved_at: undefined
  },
  {
    id: 'inc-2025-006',
    title: 'Face Liveness 간헐적 오류',
    description: '특정 이미지 유형에서 Face Liveness 검증 시 간헐적으로 오류가 발생합니다.',
    status: 'resolved',
    severity: 'low',
    priority: 'P3',
    reporter: '고객지원팀',
    detection_criteria: '특정 이미지 포맷에서 5% 오류율',
    affected_services: ['face-liveness'],
    created_at: '2025-08-30T09:30:00Z',
    resolved_at: '2025-08-30T11:15:00Z'
  }
]

// Mock Incident Updates 데이터
export const mockIncidentUpdates: Record<string, IncidentUpdate[]> = {
  'inc-2025-001': [
    {
      id: 'upd-001-001',
      incident_id: 'inc-2025-001',
      status: 'investigating',
      description: 'ID Recognition 서비스에서 응답 지연 문제 확인. 데이터베이스 연결 상태 점검 중.',
      created_at: '2025-09-01T09:35:00Z'
    },
    {
      id: 'upd-001-002',
      incident_id: 'inc-2025-001',
      status: 'identified',
      description: '원인을 데이터베이스 연결 풀 부족으로 식별. 연결 풀 크기를 50에서 100으로 증가 작업 시작.',
      created_at: '2025-09-01T10:20:00Z'
    },
    {
      id: 'upd-001-003',
      incident_id: 'inc-2025-001',
      status: 'monitoring',
      description: '연결 풀 증가 완료. 응답 시간이 정상 범위로 개선됨. 지속적 모니터링 중.',
      created_at: '2025-09-01T10:45:00Z'
    }
  ],
  
  'inc-2025-002': [
    {
      id: 'upd-002-001',
      incident_id: 'inc-2025-002',
      status: 'investigating',
      description: 'Face Compare API 타임아웃 문제 조사 시작. 서버 로그 및 네트워크 상태 확인 중.',
      created_at: '2025-09-01T10:20:00Z'
    },
    {
      id: 'upd-002-002',
      incident_id: 'inc-2025-002',
      status: 'investigating',
      description: '피크 시간대 트래픽 패턴 분석 중. CPU 사용률이 90% 이상 지속되는 것을 확인.',
      created_at: '2025-09-01T11:00:00Z'
    }
  ],
  
  'inc-2025-003': [
    {
      id: 'upd-003-001',
      incident_id: 'inc-2025-003',
      status: 'investigating',
      description: 'Curp Verifier 서비스 중단 확인. 외부 API 제공업체 연결 상태 점검 중.',
      created_at: '2025-09-01T11:50:00Z'
    },
    {
      id: 'upd-003-002',
      incident_id: 'inc-2025-003',
      status: 'identified',
      description: '외부 API 제공업체의 일시적 서비스 중단 확인. 대체 엔드포인트로 연결 변경 작업 진행 중.',
      created_at: '2025-09-01T12:15:00Z'
    }
  ],
  
  'inc-2025-004': [
    {
      id: 'upd-004-001',
      incident_id: 'inc-2025-004',
      status: 'investigating',
      description: 'ID Liveness 성능 저하 원인 조사. 시스템 리소스 사용량 점검 중.',
      created_at: '2025-08-31T14:30:00Z'
    },
    {
      id: 'upd-004-002',
      incident_id: 'inc-2025-004',
      status: 'identified',
      description: '메모리 누수로 인한 성능 저하 확인. 애플리케이션 재시작 및 메모리 누수 수정 작업 시작.',
      created_at: '2025-08-31T15:15:00Z'
    },
    {
      id: 'upd-004-003',
      incident_id: 'inc-2025-004',
      status: 'monitoring',
      description: '메모리 누수 수정 완료. 성능이 정상 수준으로 복구됨. 모니터링 지속.',
      created_at: '2025-08-31T16:30:00Z'
    },
    {
      id: 'upd-004-004',
      incident_id: 'inc-2025-004',
      status: 'resolved',
      description: '24시간 모니터링 결과 성능 안정성 확인. 인시던트 종료.',
      created_at: '2025-08-31T16:45:00Z'
    }
  ],
  
  'inc-2025-005': [
    {
      id: 'upd-005-001',
      incident_id: 'inc-2025-005',
      status: 'investigating',
      description: '모든 서비스에서 동시 부하 증가 확인. 트래픽 소스 분석 및 DDoS 공격 가능성 점검 중.',
      created_at: '2025-09-01T12:05:00Z'
    }
  ],
  
  'inc-2025-006': [
    {
      id: 'upd-006-001',
      incident_id: 'inc-2025-006',
      status: 'investigating',
      description: '특정 이미지 포맷에서의 Face Liveness 오류 조사. 이미지 처리 로직 점검 중.',
      created_at: '2025-08-30T09:45:00Z'
    },
    {
      id: 'upd-006-002',
      incident_id: 'inc-2025-006',
      status: 'identified',
      description: 'HEIC 포맷 이미지 처리에서 발생하는 오류 확인. 이미지 변환 로직 수정 필요.',
      created_at: '2025-08-30T10:20:00Z'
    },
    {
      id: 'upd-006-003',
      incident_id: 'inc-2025-006',
      status: 'resolved',
      description: 'HEIC 포맷 지원 로직 수정 완료. 테스트 완료 후 배포. 문제 해결.',
      created_at: '2025-08-30T11:15:00Z'
    }
  ]
}

// 통계 정보 생성을 위한 헬퍼 함수들
export const getIncidentStats = () => {
  const total = mockIncidents.length
  const resolved = mockIncidents.filter(i => i.status === 'resolved').length
  const investigating = mockIncidents.filter(i => i.status === 'investigating').length
  const identified = mockIncidents.filter(i => i.status === 'identified').length
  const monitoring = mockIncidents.filter(i => i.status === 'monitoring').length
  
  const p1Count = mockIncidents.filter(i => i.priority === 'P1').length
  const p2Count = mockIncidents.filter(i => i.priority === 'P2').length
  const p3Count = mockIncidents.filter(i => i.priority === 'P3').length
  
  return {
    total,
    byStatus: {
      resolved,
      investigating,
      identified,
      monitoring
    },
    byPriority: {
      P1: p1Count,
      P2: p2Count,
      P3: p3Count
    },
    activeIncidents: total - resolved,
    resolvedPercentage: Math.round((resolved / total) * 100)
  }
}

// 최근 활동을 위한 데이터
export const getRecentActivity = () => {
  const allUpdates = Object.values(mockIncidentUpdates)
    .flat()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
  
  return allUpdates.map(update => {
    const incident = mockIncidents.find(i => i.id === update.incident_id)
    return {
      ...update,
      incident_title: incident?.title || 'Unknown Incident'
    }
  })
}