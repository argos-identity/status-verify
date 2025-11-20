'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useIncidentByDate } from '@/hooks/use-incident-by-date';
import { useServicesStatus } from '@/hooks/use-services-status';
import IncidentTooltip from '../ui/incident-tooltip';

type UptimeStatus = 'operational' | 'degraded' | 'outage' | 'partial';

interface UptimeBarProps {
  status: UptimeStatus;
  date: Date;
  serviceName: string;
  index: number;
}

const UptimeBar: React.FC<UptimeBarProps> = ({ status, date, serviceName, index }) => {
  const t = useTranslations('systemStatus');
  const locale = useLocale();

  // Get incident data for this specific date and service
  const { incidents, hasIncidents, isLoading } = useIncidentByDate(date, serviceName, status);

  // Determine color based on priority levels of incidents
  const getPriorityBasedColor = () => {
    if (!hasIncidents || incidents.length === 0) {
      return 'bg-chart-1'; // Green for operational
    }

    // Check highest priority level in incidents
    const hasP1 = incidents.some(incident => incident.priority === 'P1');
    const hasP2 = incidents.some(incident => incident.priority === 'P2');
    const hasP3 = incidents.some(incident => incident.priority === 'P3');

    if (hasP1) return 'bg-chart-3';      // Red for P1 Critical
    if (hasP2) return 'bg-chart-2';      // Orange for P2 High
    if (hasP3) return 'bg-chart-4';      // Yellow for P3 Medium
    return 'bg-chart-5';                 // Blue for P4 Monitoring
  };

  // Removed hardcoded statusColors - now using priority-based colors only

  const getStatusText = (status: UptimeStatus) => {
    // Determine status text based on priority level of incidents
    if (hasIncidents && incidents.length > 0) {
      const hasP1 = incidents.some(incident => incident.priority === 'P1');
      const hasP2 = incidents.some(incident => incident.priority === 'P2');
      const hasP3 = incidents.some(incident => incident.priority === 'P3');

      if (hasP1) return t('p1Critical');
      if (hasP2) return t('p2High');
      if (hasP3) return t('p3Medium');
      return t('p4Low');
    }

    switch (status) {
      case 'operational': return t('operational');
      case 'degraded': return t('degraded');
      case 'outage': return t('majorOutage');
      case 'partial': return t('partialOutage');
      default: return t('unknownStatus');
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Enhanced tooltip content with incidents
  const tooltipContent = (
    <div className="space-y-3">
      <div className="font-semibold text-base">📅 {formatDate(date)}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-green-500">✅</span>
          <span><strong>{t('status')}:</strong> {getStatusText(status)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-purple-500">📍</span>
          <span><strong>{t('services.service')}:</strong> {serviceName}</span>
        </div>
      </div>

      {/* Show incidents for non-operational status */}
      {status !== 'operational' && (
        <>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-3 h-3 border border-current rounded-full border-t-transparent animate-spin" />
              <span>{t('loading')}</span>
            </div>
          ) : hasIncidents ? (
            <IncidentTooltip incidents={incidents} showLimit={3} />
          ) : (
            <div className="text-xs text-muted-foreground pt-1 border-t border-border">
              <span className="text-blue-500">ℹ️</span>
              <span className="ml-2">{t('noIncidents')}</span>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div className={`h-10 flex-grow rounded-[1px] cursor-pointer transition-opacity hover:opacity-80 ${getPriorityBasedColor()}`} />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="z-50 bg-popover text-popover-foreground border shadow-lg px-4 py-3 text-sm rounded-lg max-w-sm"
      >
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
};

interface ServiceStatusProps {
  name: string;
  uptimePercentage: string;
  uptimeData: UptimeStatus[];
  isLast?: boolean;
}


// Calculate uptime percentage with consistent values for operational services
const calculateUptimePercentage = (uptimeData: UptimeStatus[], serviceName?: string): string => {
  if (uptimeData.length === 0) return '99.99'; // Even with no data, show consistent 99.99%

  const totalScore = uptimeData.reduce((score, status) => {
    switch (status) {
      case 'operational': return score + 1.0;   // 100% uptime
      case 'degraded': return score + 0.75;     // 75% uptime (performance issues but service available)
      case 'partial': return score + 0.5;       // 50% uptime (some functionality affected)
      case 'outage': return score + 0.0;        // 0% uptime (service completely down)
      default: return score + 1.0;              // Default to operational
    }
  }, 0);

  let uptimePercentage = (totalScore / uptimeData.length) * 100;

  // For operational services (near-perfect uptime), show consistent 99.99%
  if (uptimePercentage >= 99.95) {
    uptimePercentage = 99.99; // Consistent value for all operational services
  }

  return uptimePercentage.toFixed(2);
};


// Helper functions for date calculations
const getCurrentDate = () => new Date();

const getStartDate = () => {
  const today = getCurrentDate();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 89); // 90 days including today
  return startDate;
};

const ServiceStatusCard: React.FC<ServiceStatusProps> = ({ name, uptimePercentage, uptimeData, isLast }) => {
  const t = useTranslations('systemStatus');

  // Determine current status based on today's data (last item in array)
  const todayStatus = uptimeData && uptimeData.length > 0 ? uptimeData[uptimeData.length - 1] : 'operational';

  // Check for incidents on today's date
  const today = new Date();
  const { incidents: todayIncidents } = useIncidentByDate(today, name, todayStatus);

  // Determine current status based on priority levels of today's incidents
  let currentStatus = 'Operational';
  let statusColor = 'text-primary'; // Green for operational

  if (todayIncidents && todayIncidents.length > 0) {
    const hasP1 = todayIncidents.some(incident => incident.priority === 'P1');
    const hasP2 = todayIncidents.some(incident => incident.priority === 'P2');
    const hasP3 = todayIncidents.some(incident => incident.priority === 'P3');

    if (hasP1) {
      currentStatus = t('p1Critical');
      statusColor = 'text-chart-3'; // Red
    } else if (hasP2) {
      currentStatus = t('p2High');
      statusColor = 'text-chart-2'; // Orange
    } else if (hasP3) {
      currentStatus = t('p3Medium');
      statusColor = 'text-yellow-500'; // Yellow
    } else {
      currentStatus = t('p4Low');
      statusColor = 'text-chart-5'; // Blue for monitoring
    }
  }

  return (
    <div className={`px-6 py-5 ${!isLast ? 'border-b border-border' : ''}`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-medium text-foreground">{name}</h3>
        <p className={`text-sm font-medium ${statusColor}`}>{currentStatus}</p>
      </div>
      <div className="flex items-center gap-px">
        {uptimeData.map((status, index) => {
          const startDate = getStartDate();
          const barDate = new Date(startDate);
          barDate.setDate(startDate.getDate() + index);

          return (
            <UptimeBar
              key={`${name}-bar-${index}`}
              status={status}
              date={barDate}
              serviceName={name}
              index={index}
            />
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-2 text-xs text-muted">
        <span>90 days ago</span>
        <span className="font-medium text-foreground">{uptimePercentage}% uptime</span>
        <span>Today</span>
      </div>
    </div>
  );
};

const SystemStatus = () => {
  const t = useTranslations('systemStatus');

  // Use dynamic services data from API
  const { services: apiServices, isLoading, error } = useServicesStatus();

  // Only show API services, no fallback to mock data
  const displayServices = apiServices || [];

  // Always return fixed status text regardless of system condition
  const getOverallStatus = () => {
    return t('allSystemsOperational');
  };

  // Calculate system status considering P4 incidents
  const systemHasIssues = useMemo(() => {
    if (!displayServices || displayServices.length === 0) return false;

    return displayServices.some(service => {
      if (!service.uptimeData || service.uptimeData.length === 0) return false;
      const recentStatuses = service.uptimeData.slice(-7);

      return recentStatuses.some(status => {
        if (status === 'outage') return true;
        // degraded 상태는 개별 서비스 컴포넌트에서 P4 체크하므로 여기서는 단순히 true 반환
        if (status === 'degraded') return true;
        return false;
      });
    });
  }, [displayServices]);

  const getStatusColor = () => {
    // 로딩 중일 때만 파란색, 그 외에는 항상 녹색 유지
    if (isLoading) return 'bg-blue-500 text-white';

    // API 에러나 서비스 상태와 관계없이 항상 녹색 유지
    return 'bg-primary text-primary-foreground';
  };

  return (
    <TooltipProvider>
      <div className="max-w-[850px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12">
        <div className={`text-center py-4 rounded-sm mb-5 ${getStatusColor()}`}>
          <h2 className="text-2xl font-bold">{getOverallStatus()}</h2>
        </div>

        <div className="text-right text-xs text-muted mb-3 pr-1">
          Uptime over the past 90 days.
        </div>

        <div className="bg-card border border-border rounded-sm">
          {error ? (
            <div className="px-6 py-8 text-center text-muted-foreground">
              <p className="text-lg font-medium text-red-500 mb-2">Backend API Connection Failed</p>
              <p className="text-sm">Unable to connect to monitoring API. Please check if the backend server is running.</p>
            </div>
          ) : displayServices.length === 0 ? (
            <div className="px-6 py-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">No Service Data Available</p>
              <p className="text-sm">Please ensure the backend API is connected and services are configured.</p>
            </div>
          ) : (
            displayServices.map((service, index) => (
              <ServiceStatusCard
                key={service.name}
                name={service.name}
                uptimePercentage={service.uptimePercentage}
                uptimeData={service.uptimeData}
                isLast={index === displayServices.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default SystemStatus;