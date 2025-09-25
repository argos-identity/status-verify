'use client';

import React from 'react';
import { Clock, AlertTriangle, User, Server, CheckCircle, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  type Incident,
  type IncidentDay,
  STATUS_INFO,
  PRIORITY_INFO,
  SEVERITY_INFO
} from '@/lib/incident-types';
import {
  formatDate,
  formatRelativeTime,
  formatServiceName,
  calculateResolutionTime,
  groupIncidentsByDate
} from '@/lib/utils';

interface IncidentHistoryProps {
  incidents: Incident[];
  isLoading?: boolean;
  error?: string;
  showAllIncidents?: boolean;
}

const StatusBadge: React.FC<{ status: Incident['status'] }> = ({ status }) => {
  const info = STATUS_INFO[status];
  return (
    <Badge
      variant="secondary"
      className="text-xs"
      style={{
        backgroundColor: info.bgColor,
        color: info.color,
        border: `1px solid ${info.color}20`
      }}
    >
      {info.label}
    </Badge>
  );
};

const PriorityBadge: React.FC<{ priority: Incident['priority'] }> = ({ priority }) => {
  const info = PRIORITY_INFO[priority];
  return (
    <Badge
      variant="outline"
      className="text-xs font-medium"
      style={{
        backgroundColor: info.bgColor,
        color: info.color,
        borderColor: info.color
      }}
    >
      {info.label}
    </Badge>
  );
};

const SeverityBadge: React.FC<{ severity: Incident['severity'] }> = ({ severity }) => {
  const info = SEVERITY_INFO[severity];
  return (
    <Badge
      variant="outline"
      className="text-xs"
      style={{
        backgroundColor: info.bgColor,
        color: info.color,
        borderColor: info.color
      }}
    >
      {info.label}
    </Badge>
  );
};

const IncidentCard: React.FC<{ incident: Incident }> = ({ incident }) => {
  const resolutionTime = calculateResolutionTime(incident.created_at, incident.resolved_at);

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 border-l-4"
          style={{
            borderLeftColor: incident.status === 'resolved'
              ? STATUS_INFO.resolved.color
              : STATUS_INFO.investigating.color
          }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
              {incident.title}
            </h3>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusBadge status={incident.status} />
              <PriorityBadge priority={incident.priority} />
              <SeverityBadge severity={incident.severity} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatRelativeTime(incident.created_at)}</span>
            </div>
            {resolutionTime && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span className="text-xs">{resolutionTime}만에 해결</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {incident.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {incident.description}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* 보고자 정보 */}
          {incident.reporter && (
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">보고자:</span>
              <span className="font-medium">{incident.reporter}</span>
            </div>
          )}

          {/* 영향받는 서비스 */}
          <div className="flex items-start gap-2">
            <Server className="w-3 h-3 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-muted-foreground">영향 서비스:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {incident.affected_services.map((service) => (
                  <Badge
                    key={service}
                    variant="outline"
                    className="text-xs px-2 py-0"
                  >
                    {formatServiceName(service)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* 생성 및 해결 시간 */}
          <div className="md:col-span-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                생성: {formatDate(incident.created_at)}
              </span>
              {incident.resolved_at && (
                <span className="text-green-600">
                  해결: {formatDate(incident.resolved_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Incident Updates */}
        {incident.updates && incident.updates.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-foreground mb-3">업데이트 내역</h4>
            <div className="space-y-3">
              {incident.updates.slice(0, 3).map((update, idx) => (
                <div key={update.id} className="text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={update.status} />
                    <span className="text-muted-foreground">{formatDate(update.created_at)}</span>
                  </div>
                  <p className="text-foreground pl-2 border-l-2 border-border ml-1">
                    {update.description}
                  </p>
                </div>
              ))}
              {incident.updates.length > 3 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  및 {incident.updates.length - 3}개의 추가 업데이트...
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const IncidentDayGroup: React.FC<{ incidentDay: IncidentDay }> = ({ incidentDay }) => {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
        <Calendar className="w-4 h-4 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">
          {incidentDay.date}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {incidentDay.incidents.length}건
        </Badge>
      </div>

      <div className="space-y-4">
        {incidentDay.incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
    </div>
  );
};

const LoadingState: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="mb-4">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-gray-300 border-t-primary rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Failure Event History ...
        </h2>
        <p className="text-text-secondary">
          잠시만 기다려주세요.
        </p>
      </div>
    </div>
  );
};

const ErrorState: React.FC<{ error: string }> = ({ error }) => {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          데이터를 불러올 수 없습니다
        </h2>
        <p className="text-muted-foreground mb-4">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ showAllIncidents?: boolean }> = ({ showAllIncidents = false }) => {
  return (
    <div className="text-center py-12">
      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {showAllIncidents ? '장애 이벤트가 없습니다' : '해결된 장애 이벤트가 없습니다'}
      </h3>
      <p className="text-muted-foreground">
        {showAllIncidents
          ? '지난 90일간 장애 이벤트가 없습니다. 시스템이 안정적으로 운영되고 있습니다.'
          : '지난 90일간 해결된 장애 이벤트가 없습니다. 시스템이 안정적으로 운영되고 있습니다.'
        }
      </p>
    </div>
  );
};

const IncidentHistory: React.FC<IncidentHistoryProps> = ({
  incidents,
  isLoading = false,
  error,
  showAllIncidents = false
}) => {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!incidents || incidents.length === 0) {
    return <EmptyState showAllIncidents={showAllIncidents} />;
  }

  // Group incidents by date
  const incidentDays = groupIncidentsByDate(incidents);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">
          {showAllIncidents ? '모든 장애 이벤트' : 'Past Incidents'}
        </h2>
        <div className="flex items-center gap-3">
          {!showAllIncidents && (
            <button
              onClick={() => window.location.href = '/incidents'}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              장애 이벤트 자세히
            </button>
          )}
          <Badge variant="outline" className="text-sm">
            총 {incidents.length}건의 {showAllIncidents ? '장애 이벤트' : '해결된 장애 이벤트'}
          </Badge>
        </div>
      </div>

      <div className="space-y-8">
        {incidentDays.map((incidentDay) => (
          <IncidentDayGroup key={incidentDay.date} incidentDay={incidentDay} />
        ))}
      </div>
    </div>
  );
};

export default IncidentHistory;