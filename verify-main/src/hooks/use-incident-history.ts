'use client';

import { useIncidentHistoryContext } from '@/context/IncidentHistoryContext';
import { type Incident } from '@/lib/incident-types';

interface UseIncidentHistoryResult {
  incidents: Incident[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook for accessing incident history data from Context
 * This replaces the previous implementation that made individual API calls
 * Now all data is centralized through IncidentHistoryContext
 */
export const useIncidentHistory = (): UseIncidentHistoryResult => {
  const context = useIncidentHistoryContext();

  return {
    incidents: context.incidents,
    isLoading: context.isLoading,
    error: context.error,
    refetch: context.refetch
  };
};