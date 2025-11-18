'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, User, Server, CheckCircle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  type Incident,
  STATUS_INFO,
  PRIORITY_INFO,
  SEVERITY_INFO
} from '@/lib/incident-types';
import {
  formatDate,
  formatRelativeTime,
  formatServiceName,
  calculateResolutionTime
} from '@/lib/utils';

interface PaginatedIncidentHistoryProps {
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
  const t = useTranslations('incidentHistory');
  const resolutionTime = calculateResolutionTime(incident.created_at, incident.resolved_at);

  return (
    <Card className="hover:shadow-md transition-all duration-300 border-l-4 transform"
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
                <span className="text-xs">{t('resolvedInMinutes', { minutes: resolutionTime })}</span>
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
              <span className="text-muted-foreground">{t('reportedBy')}:</span>
              <span className="font-medium">{incident.reporter}</span>
            </div>
          )}

          {/* 영향받는 서비스 */}
          <div className="flex items-start gap-2">
            <Server className="w-3 h-3 text-muted-foreground mt-0.5" />
            <div>
              <span className="text-muted-foreground">{t('affectedServices')}:</span>
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
                {t('created')}: {formatDate(incident.created_at)}
              </span>
              {incident.resolved_at && (
                <span className="text-green-600">
                  {t('resolved')}: {formatDate(incident.resolved_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Incident Updates */}
        {incident.updates && incident.updates.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-foreground mb-3">{t('updateHistory')}</h4>
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
                  {t('moreUpdates', { count: incident.updates.length - 3 })}...
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const LoadingState: React.FC = () => {
  const t = useTranslations('incidentHistory');
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
          {t('loadingMessage')}
        </p>
      </div>
    </div>
  );
};

const ErrorState: React.FC<{ error: string }> = ({ error }) => {
  const t = useTranslations('incidentHistory');
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {t('errorMessage')}
        </h2>
        <p className="text-muted-foreground mb-4">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('retryButton')}
        </button>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ showAllIncidents?: boolean }> = ({ showAllIncidents = false }) => {
  const t = useTranslations('incidentHistory');
  return (
    <div className="text-center py-12">
      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {showAllIncidents ? t('systemReady') : t('noOngoingIncidents')}
      </h3>
      <p className="text-muted-foreground mb-4">
        {showAllIncidents
          ? t('systemReadyDescription')
          : t('noOngoingDescription')
        }
      </p>
      <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 max-w-md mx-auto">
        <p className="font-medium mb-2">{t('monitoringActive')}</p>
        <ul className="text-left space-y-1">
          {(t.raw('monitoringItems') as string[]).map((item: string, index: number) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const CompactNavigation: React.FC<{
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}> = ({ currentIndex, total, onPrevious, onNext }) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={currentIndex === 0}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <span className="text-sm text-muted-foreground font-mono min-w-[3rem] text-center">
        {currentIndex + 1} / {total}
      </span>

      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={currentIndex === total - 1}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

const PaginatedIncidentHistory: React.FC<PaginatedIncidentHistoryProps> = ({
  incidents,
  isLoading = false,
  error,
  showAllIncidents = false
}) => {
  const t = useTranslations('incidentHistory');
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset to first incident when incidents change
  useEffect(() => {
    setCurrentIndex(0);
  }, [incidents]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (incidents.length === 0) return;

      if (event.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      } else if (event.key === 'ArrowRight' && currentIndex < incidents.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, incidents.length]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < incidents.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!incidents || incidents.length === 0) {
    return <EmptyState showAllIncidents={showAllIncidents} />;
  }

  const currentIncident = incidents[currentIndex];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">
          {showAllIncidents ? t('allFailureEvents') : t('ongoingFailureEvents')}
        </h2>
        <div className="flex items-center gap-4">
          <CompactNavigation
            currentIndex={currentIndex}
            total={incidents.length}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />
          {!showAllIncidents && (
            <button
              onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_INCIDENTS_URL}/incidents/${currentIncident.id}`}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              {t('viewDetails')}
            </button>
          )}
          <Badge variant="outline" className="text-sm">
            {showAllIncidents ? t('totalAll', { count: incidents.length }) : t('totalOngoing', { count: incidents.length })}
          </Badge>
        </div>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">
            {formatDate(currentIncident.created_at).split(' ')[0]}
          </h3>
        </div>

        <div
          key={currentIncident.id}
          className="animate-in fade-in-0 slide-in-from-right-4 duration-300"
        >
          <IncidentCard incident={currentIncident} />
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
        <p>{t('navigationHelp')}</p>
      </div>
    </div>
  );
};

export default PaginatedIncidentHistory;