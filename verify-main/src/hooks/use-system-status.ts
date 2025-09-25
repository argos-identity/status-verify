'use client';

import useSWR from 'swr';
import { apiClient, SystemStatusResponse } from '../lib/api-client';

interface UseSystemStatusReturn {
  data: SystemStatusResponse | undefined;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
}

export function useSystemStatus(): UseSystemStatusReturn {
  const { data, error, isLoading, mutate } = useSWR(
    'system-status',
    async () => {
      const response = await apiClient.getSystemStatus();

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch system status');
      }

      return response.data;
    },
    {
      refreshInterval: 300000, // 5분마다 자동 새로고침
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    data,
    isLoading,
    error,
    mutate,
  };
}

// Additional hook for services data - now gets data from system status
export function useServices() {
  const { data: systemStatus, error, isLoading, mutate } = useSystemStatus();

  // Extract services from system status data
  const servicesData = systemStatus?.services || [];

  return {
    data: servicesData,
    isLoading,
    error,
    mutate,
  };
}

// Hook for incidents data (active incidents)
export function useIncidents() {
  const { data, error, isLoading, mutate } = useSWR(
    'incidents',
    async () => {
      const response = await apiClient.getActiveIncidents();
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch incidents');
      }
      return response.data;
    },
    {
      refreshInterval: 300000, // 5분마다 새로고침
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  return {
    data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for past incidents data
export function usePastIncidents() {
  const { data, error, isLoading, mutate } = useSWR(
    'past-incidents',
    async () => {
      const response = await apiClient.getPastIncidents();
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch past incidents');
      }
      return response.data;
    },
    {
      refreshInterval: 300000, // 5분마다 새로고침
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  return {
    data,
    isLoading,
    error,
    mutate,
  };
}