import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow, parseISO } from "date-fns"
import { ko } from "date-fns/locale"
import type { IncidentStatus, IncidentPriority, IncidentSeverity } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 날짜 포맷팅 함수들
export function formatDate(dateString: string): string {
  return format(parseISO(dateString), "yyyy-MM-dd HH:mm", { locale: ko })
}

export function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(parseISO(dateString), { 
    addSuffix: true, 
    locale: ko 
  })
}

export function formatDateForInput(dateString: string): string {
  return format(parseISO(dateString), "yyyy-MM-dd'T'HH:mm")
}

// Incident 관련 유틸리티 함수들
export function getStatusColor(status: IncidentStatus): string {
  const colors = {
    investigating: 'text-orange-600 bg-orange-50',
    identified: 'text-yellow-600 bg-yellow-50',
    monitoring: 'text-blue-600 bg-blue-50',
    resolved: 'text-green-600 bg-green-50'
  }
  return colors[status] || 'text-gray-600 bg-gray-50'
}

export function getPriorityColor(priority: IncidentPriority): string {
  const colors = {
    P1: 'text-red-600 bg-red-50 border-red-200',
    P2: 'text-orange-600 bg-orange-50 border-orange-200',
    P3: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    P4: 'text-green-600 bg-green-50 border-green-200'
  }
  return colors[priority] || 'text-gray-600 bg-gray-50 border-gray-200'
}

export function getSeverityColor(severity: IncidentSeverity): string {
  const colors = {
    critical: 'text-red-700 bg-red-100',
    high: 'text-red-600 bg-red-50',
    medium: 'text-orange-600 bg-orange-50',
    low: 'text-yellow-600 bg-yellow-50'
  }
  return colors[severity] || 'text-gray-600 bg-gray-50'
}

// 우선순위 자동 추천 함수
export function suggestPriority(severity: IncidentSeverity): IncidentPriority {
  const suggestions = {
    critical: 'P1',
    high: 'P2',
    medium: 'P3',
    low: 'P4'
  } as const
  return suggestions[severity]
}

// 해결 시간 계산
export function calculateResolutionTime(
  createdAt: string, 
  resolvedAt?: string
): string | null {
  if (!resolvedAt) return null
  
  const created = parseISO(createdAt)
  const resolved = parseISO(resolvedAt)
  const diffInMinutes = Math.floor((resolved.getTime() - created.getTime()) / (1000 * 60))
  
  if (diffInMinutes < 60) {
    return `${diffInMinutes}분`
  } else if (diffInMinutes < 24 * 60) {
    const hours = Math.floor(diffInMinutes / 60)
    const minutes = diffInMinutes % 60
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
  } else {
    const days = Math.floor(diffInMinutes / (24 * 60))
    const hours = Math.floor((diffInMinutes % (24 * 60)) / 60)
    return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`
  }
}

// 키보드 단축키 처리
export function handleKeyboardShortcut(
  event: KeyboardEvent, 
  shortcuts: Record<string, () => void>
): void {
  const key = event.key.toLowerCase()
  const modifiers = {
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey
  }

  // Ctrl+S (저장)
  if ((modifiers.ctrl || modifiers.meta) && key === 's') {
    event.preventDefault()
    shortcuts.save?.()
  }

  // Esc (취소)
  if (key === 'escape') {
    event.preventDefault()
    shortcuts.cancel?.()
  }

  // Ctrl+N (새 장애 이벤트)
  if ((modifiers.ctrl || modifiers.meta) && key === 'n') {
    event.preventDefault()
    shortcuts.new?.()
  }
}

// 자동저장용 디바운스 함수
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// 로컬 스토리지 유틸리티 (자동저장용)
export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue
    
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  },

  set: (key: string, value: any): void => {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to save to localStorage:', error)
    }
  },

  remove: (key: string): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(key)
  }
}

// Incident ID 생성 함수
export function generateIncidentId(): string {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substr(2, 5)
  return `inc-${timestamp}-${random}`
}

// 서비스 이름 포맷팅
export function formatServiceName(serviceId: string): string {
  const serviceNames: Record<string, string> = {
    'id-recognition': 'ID Recognition',
    'face-liveness': 'Face Liveness',
    'id-liveness': 'ID Liveness',
    'face-compare': 'Face Compare',
    'curp-verifier': 'Curp Verifier'
  }
  return serviceNames[serviceId] || serviceId
}

// URL 파라미터 생성
export function createQueryString(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') {
      searchParams.set(key, value)
    }
  })
  
  return searchParams.toString()
}