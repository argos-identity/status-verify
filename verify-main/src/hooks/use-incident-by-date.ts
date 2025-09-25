'use client';

import { useMemo } from 'react';
import { type Incident } from '@/lib/incident-types';
import { useIncidentHistoryContext } from '@/context/IncidentHistoryContext';

type UptimeStatus = 'operational' | 'degraded' | 'outage' | 'partial';

interface UseIncidentByDateResult {
  incidents: Incident[];
  isLoading: boolean;
  error: string | null;
  hasIncidents: boolean;
}

// Service name mapping to match incident affected_services
const SERVICE_ID_MAP: Record<string, string> = {
  'ID Recognition': 'id-recognition',
  'Face Liveness': 'face-liveness',
  'ID Liveness': 'id-liveness',
  'Face Compare': 'face-compare',
  'CURP Verifier': 'curp-verifier',
};

/**
 * Optimized hook that gets incidents for a specific date and service
 * Uses Context directly to avoid multiple API calls
 * Memoizes filtered results for performance
 */
export const useIncidentByDate = (
  date: Date,
  serviceName: string,
  status: UptimeStatus
): UseIncidentByDateResult => {
  const { incidents: allIncidents, isLoading, error } = useIncidentHistoryContext();

  const relevantIncidents = useMemo(() => {
    // Only show incidents for non-operational status
    if (status === 'operational') {
      return [];
    }

    if (!allIncidents || allIncidents.length === 0) {
      return [];
    }

    // Convert service name to service ID for matching
    let serviceId: string | undefined = SERVICE_ID_MAP[serviceName];

    // Fallback: try case-insensitive lookup if exact match fails
    if (!serviceId) {
      const serviceNameLower = serviceName.toLowerCase();
      const matchedEntry = Object.entries(SERVICE_ID_MAP).find(
        ([key]) => key.toLowerCase() === serviceNameLower
      );
      serviceId = matchedEntry?.[1];
    }

    if (!serviceId) {
      console.warn(`Service name "${serviceName}" not found in SERVICE_ID_MAP`);
      return [];
    }

    // Get the date range for the specified date (start and end of day)
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Filter incidents that:
    // 1. Affect the specified service
    // 2. Were active during the target date
    // 3. Match the severity of the status (optional enhancement)
    const filtered = allIncidents.filter((incident) => {
      // Check if this incident affects the target service
      if (!incident.affected_services.includes(serviceId)) {
        return false;
      }

      const createdAt = new Date(incident.created_at);
      const resolvedAt = incident.resolved_at ? new Date(incident.resolved_at) : null;

      // Check if incident was active during the target date
      // Incident is active if:
      // - It was created before or during the target date AND
      // - It was either not resolved or resolved after the target date started
      const wasActiveOnDate =
        createdAt <= endOfDay &&
        (!resolvedAt || resolvedAt >= startOfDay);

      return wasActiveOnDate;
    });

    // Sort by priority (P1 first) and creation date (most recent first)
    return filtered.sort((a, b) => {
      // Priority order: P1 > P2 > P3 > P4
      const priorityOrder = { P1: 1, P2: 2, P3: 3, P4: 4 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // If same priority, sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allIncidents, date, serviceName, status]);

  return {
    incidents: relevantIncidents,
    isLoading,
    error,
    hasIncidents: relevantIncidents.length > 0,
  };
};