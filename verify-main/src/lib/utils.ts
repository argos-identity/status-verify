import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { type Incident, type IncidentDay } from './incident-types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format date to Korean locale string
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Format relative time (e.g., "2시간 전")
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}일 전`;
  } else if (diffHours > 0) {
    return `${diffHours}시간 전`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}분 전`;
  } else {
    return '방금 전';
  }
}

// Format service name for display
export function formatServiceName(serviceId: string): string {
  const serviceNameMap: Record<string, string> = {
    'id-recognition': 'ID Recognition',
    'face-liveness': 'Face Liveness',
    'id-liveness': 'ID Liveness',
    'face-compare': 'Face Compare',
    'curp-verifier': 'Curp Verifier'
  };
  return serviceNameMap[serviceId] || serviceId;
}

// Calculate resolution time
export function calculateResolutionTime(createdAt: string, resolvedAt?: string): string | null {
  if (!resolvedAt) return null;

  const created = new Date(createdAt);
  const resolved = new Date(resolvedAt);
  const diffMs = resolved.getTime() - created.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (diffHours > 0) {
    return remainingMinutes > 0
      ? `${diffHours}시간 ${remainingMinutes}분`
      : `${diffHours}시간`;
  } else {
    return `${diffMinutes}분`;
  }
}

// Group incidents by date
export function groupIncidentsByDate(incidents: Incident[]): IncidentDay[] {
  const grouped: { [key: string]: Incident[] } = {};

  incidents.forEach(incident => {
    const date = incident.resolved_at || incident.created_at;
    const dateKey = new Date(date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(incident);
  });

  return Object.entries(grouped).map(([date, incidents]) => ({
    date,
    incidents
  })).sort((a, b) => {
    // Sort by date (most recent first)
    const dateA = new Date(a.incidents[0].resolved_at || a.incidents[0].created_at);
    const dateB = new Date(b.incidents[0].resolved_at || b.incidents[0].created_at);
    return dateB.getTime() - dateA.getTime();
  });
}
