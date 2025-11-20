'use client';

import React from 'react';
import { type Incident, STATUS_INFO, PRIORITY_INFO } from '@/lib/incident-types';

interface IncidentTooltipProps {
  incidents: Incident[];
  showLimit?: number;
}

const IncidentTooltip: React.FC<IncidentTooltipProps> = ({
  incidents,
  showLimit = 3
}) => {
  if (!incidents || incidents.length === 0) {
    return null;
  }

  const displayedIncidents = incidents.slice(0, showLimit);
  const remainingCount = incidents.length - showLimit;

  // Priority icons mapping
  const getPriorityIcon = (priority: Incident['priority']) => {
    switch (priority) {
      case 'P1': return '🔴';
      case 'P2': return '🟠';
      case 'P3': return '🟡';
      default: return '⚪';
    }
  };

  // Get relative time string
  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 60) {
      return `${diffInMinutes}분 전`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}시간 전`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays}일 전`;
    }

    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pb-1 border-b border-border">
        <span className="text-orange-500">⚠️</span>
        <span className="font-medium text-sm">관련 Failure Event:</span>
      </div>

      <div className="space-y-2">
        {displayedIncidents.map((incident) => {
          const statusInfo = STATUS_INFO[incident.status];
          const priorityIcon = getPriorityIcon(incident.priority);

          return (
            <div
              key={incident.id}
              className="text-xs space-y-1 p-2 rounded-md bg-muted/30 border border-border"
            >
              {/* Title with priority */}
              <div className="flex items-start gap-2">
                <span className="text-xs">{priorityIcon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-xs leading-tight">
                    [{incident.priority}] {incident.title}
                  </span>
                </div>
              </div>

              {/* Status and time */}
              <div className="flex items-center justify-between text-xs text-muted-foreground ml-4">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: statusInfo.color }}
                  />
                  <span>{statusInfo.label}</span>
                </div>
                <span>{getRelativeTime(incident.created_at)}</span>
              </div>

              {/* Description if available and short */}
              {incident.description && incident.description.length < 50 && (
                <div className="text-xs text-muted-foreground ml-4 mt-1">
                  {incident.description}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show remaining count if there are more incidents */}
      {remainingCount > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-1 border-t border-border">
          ... 외 <span className="font-medium">{remainingCount}건</span> 더보기
        </div>
      )}
    </div>
  );
};

export default IncidentTooltip;