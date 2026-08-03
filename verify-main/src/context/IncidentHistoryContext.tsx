'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { type Incident } from '@/lib/incident-types';

interface IncidentHistoryContextType {
  incidents: Incident[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

const IncidentHistoryContext = createContext<IncidentHistoryContextType | undefined>(undefined);

interface IncidentHistoryProviderProps {
  children: ReactNode;
}

// API function - using Next.js API route for detailed incident data
const fetchIncidentHistory = async (): Promise<Incident[]> => {
  try {
    // Call our Next.js API route for all incident details
    const response = await fetch('/api/incidents/detail', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch incident history: ${response.statusText}`);
    }

    const result = await response.json();

    // Extract incidents from API response structure
    if (result.success && result.data) {
      // Log data source for debugging
      if (result.source === 'mock') {
        console.info('📊 Using mock data:', result.message);
      } else {
        console.info('📊 Connected to backend API');
      }

      return result.data;
    } else {
      throw new Error('Invalid API response format');
    }
  } catch (error) {
    console.error('Failed to fetch incident history:', error);
    throw error;
  }
};

export const IncidentHistoryProvider: React.FC<IncidentHistoryProviderProps> = ({ children }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
      setError(null);
      const data = await fetchIncidentHistory();
      setIncidents(data);
      console.info('🔄 Incident history fetched successfully:', data.length, 'incidents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failure Event 상세 정보를 불러오는데 실패했습니다.');
      setIncidents([]);
      console.error('❌ Failed to fetch incident history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refetch = () => {
    console.info('🔄 Refetching incident history...');
    fetchData();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    fetchData();
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const value: IncidentHistoryContextType = {
    incidents,
    isLoading,
    error,
    refetch,
  };

  return (
    <IncidentHistoryContext.Provider value={value}>
      {children}
    </IncidentHistoryContext.Provider>
  );
};

export const useIncidentHistoryContext = (): IncidentHistoryContextType => {
  const context = useContext(IncidentHistoryContext);
  if (context === undefined) {
    throw new Error('useIncidentHistoryContext must be used within an IncidentHistoryProvider');
  }
  return context;
};