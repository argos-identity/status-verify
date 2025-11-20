'use client';

import { useState, useEffect } from 'react';

type UptimeStatus = 'operational' | 'degraded' | 'outage' | 'partial';

interface ServiceStatusData {
  name: string;
  uptimePercentage: string;
  uptimeData: UptimeStatus[];
}

interface UseServicesStatusResult {
  services: ServiceStatusData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// API function to fetch services status history
const fetchServicesStatus = async (): Promise<ServiceStatusData[]> => {
  try {
    const response = await fetch('/api/services/status-history', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch services status: ${response.statusText}`);
    }

    const result = await response.json();

    // Extract services from API response structure
    if (result.success && result.data && result.data.services) {
      // Log data source for debugging
      if (result.source === 'mock') {
        console.info('📊 Using mock data for services status:', result.message);
      } else {
        console.info('📊 Connected to backend API for services status');
      }

      return result.data.services;
    } else {
      throw new Error('Invalid API response format');
    }
  } catch (error) {
    console.error('Failed to fetch services status:', error);
    throw error;
  }
};

export const useServicesStatus = (): UseServicesStatusResult => {
  const [services, setServices] = useState<ServiceStatusData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchServicesStatus();
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '서비스 상태 정보를 불러오는데 실패했습니다.');
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  };

  const refetch = () => {
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    services,
    isLoading,
    error,
    refetch
  };
};