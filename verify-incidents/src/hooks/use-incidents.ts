import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { Incident, IncidentUpdate, IncidentFilters } from '@/lib/types';
import { mockIncidents, mockIncidentUpdates } from '@/lib/mock-data';
import apiClient, { type ApiError } from '@/lib/api-client';
import { DEV_CONFIG } from '@/config/api';

// 인시던트 상태 관리 훅
export const useIncidents = (filters?: IncidentFilters) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  // Set auth token when session changes
  useEffect(() => {
    if (session?.accessToken) {
      apiClient.setAuthToken(session.accessToken);
    } else {
      apiClient.setAuthToken(null);
    }
  }, [session]);

  // Handle authentication and permission errors
  const handleAuthError = useCallback((error: ApiError) => {
    if (error.status === 401) {
      console.warn('Authentication failed:', error.message);
      return 'Authentication required. Please login to access this content.';
    }
    if (error.status === 403) {
      console.warn('Permission denied:', error.message);
      if (error.userRole) {
        return `Permission denied. Your role (${error.userRole}) does not have the required permissions to access incidents. Please contact an administrator.`;
      }
      return 'Permission denied. You do not have the required permissions to access incidents. Please contact an administrator.';
    }
    return error.message;
  }, []);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiClient.getAllIncidents({
        limit: 100,
        includeUpdates: true,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      setIncidents(data);

      if (DEV_CONFIG.logApiCalls) {
        console.log('Loaded incidents from API:', data.length);
      }
    } catch (err) {
      const apiError = err as ApiError;

      // Fallback to mock data in development if API is unavailable or authentication fails
      if (DEV_CONFIG.mockDataFallback && (apiError.status === 0 || apiError.status >= 500 || apiError.status === 403 || apiError.status === 401)) {
        console.info('API error, falling back to mock data:', apiError.message);
        // Sort mock data by created_at in descending order (newest first)
        const sortedMockIncidents = [...mockIncidents].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setIncidents(sortedMockIncidents);
        setError(null);
      } else {
        console.error('Failed to load incidents:', apiError);
        setError(handleAuthError(apiError));
        setIncidents([]);
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  // Load incidents from API on mount
  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  // 필터링된 인시던트 반환
  const filteredIncidents = incidents.filter(incident => {
    if (!filters) return true;

    const matchesStatus = !filters.status || filters.status === 'all' || incident.status === filters.status;
    const matchesPriority = !filters.priority || filters.priority === 'all' || incident.priority === filters.priority;
    const matchesSeverity = !filters.severity || filters.severity === 'all' || incident.severity === filters.severity;
    const matchesService = !filters.affected_service || filters.affected_service === 'all' ||
      incident.affected_services.includes(filters.affected_service);

    return matchesStatus && matchesPriority && matchesSeverity && matchesService;
  });

  // 인시던트 새로고침
  const refresh = loadIncidents;

  return {
    incidents: filteredIncidents,
    allIncidents: incidents,
    loading,
    error,
    refresh
  };
};

// 단일 인시던트 관리 훅
export const useIncident = (incidentId: string) => {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  // Set auth token when session changes
  useEffect(() => {
    if (session?.accessToken) {
      apiClient.setAuthToken(session.accessToken);
    } else {
      apiClient.setAuthToken(null);
    }
  }, [session]);

  // Handle authentication and permission errors
  const handleAuthError = useCallback((error: ApiError) => {
    if (error.status === 401) {
      console.warn('Authentication failed:', error.message);
      return 'Authentication required. Please login to access this content.';
    }
    if (error.status === 403) {
      console.warn('Permission denied:', error.message);
      if (error.userRole) {
        return `Permission denied. Your role (${error.userRole}) does not have the required permissions to view this incident. Please contact an administrator.`;
      }
      return 'Permission denied. You do not have the required permissions to view this incident. Please contact an administrator.';
    }
    return error.message;
  }, []);

  const loadIncident = useCallback(async () => {
    if (!incidentId) return;

    setLoading(true);
    setError(null);

    try {
      // Load incident with updates included
      const incidentData = await apiClient.getIncident(incidentId, {
        includeUpdates: true,
        includeTimeline: true,
      });

      if (incidentData) {
        setIncident(incidentData);

        // Extract updates from incident data (they come embedded in the response)
        const updates = incidentData.updates || [];
        setUpdates(updates);
        setError(null);

        if (DEV_CONFIG.logApiCalls) {
          console.log('Loaded incident from API:', incidentData.id);
          console.log('Loaded updates:', updates.length);
        }
      } else {
        setError('인시던트를 찾을 수 없습니다.');
        setIncident(null);
        setUpdates([]);
      }
    } catch (err) {
      const apiError = err as ApiError;

      // Fallback to mock data in development if API is unavailable or authentication fails
      if (DEV_CONFIG.mockDataFallback && (apiError.status === 0 || apiError.status >= 500 || apiError.status === 403 || apiError.status === 401)) {
        console.info('API error, falling back to mock data for incident:', incidentId);
        const foundIncident = mockIncidents.find(i => i.id === incidentId);
        const foundUpdates = mockIncidentUpdates[incidentId] || [];

        if (foundIncident) {
          setIncident(foundIncident);
          setUpdates(foundUpdates);
          setError(null);
        } else {
          setError('인시던트를 찾을 수 없습니다.');
        }
      } else {
        console.error('Failed to load incident:', apiError);
        setError(handleAuthError(apiError));
        setIncident(null);
        setUpdates([]);
      }
    } finally {
      setLoading(false);
    }
  }, [incidentId, handleAuthError]);

  useEffect(() => {
    loadIncident();
  }, [loadIncident]);

  const refresh = loadIncident;

  return {
    incident,
    updates,
    loading,
    error,
    refresh
  };
};

// 인시던트 통계 훅
export const useIncidentStats = () => {
  const [stats, setStats] = useState({
    total: 0,
    resolved: 0,
    active: 0,
    p1Count: 0,
    resolvedPercentage: 0,
    byStatus: {
      resolved: 0,
      investigating: 0,
      identified: 0,
      monitoring: 0,
    },
    recentActivity: [] as Array<Incident & { action: string }>
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  // Set auth token when session changes
  useEffect(() => {
    if (session?.accessToken) {
      apiClient.setAuthToken(session.accessToken);
    } else {
      apiClient.setAuthToken(null);
    }
  }, [session]);

  // Handle authentication and permission errors
  const handleAuthError = useCallback((error: ApiError) => {
    if (error.status === 401) {
      console.warn('Authentication failed:', error.message);
      return 'Authentication required. Please login to access this content.';
    }
    if (error.status === 403) {
      console.warn('Permission denied:', error.message);
      if (error.userRole) {
        return `Permission denied. Your role (${error.userRole}) does not have the required permissions to view incident statistics. Please contact an administrator.`;
      }
      return 'Permission denied. You do not have the required permissions to view incident statistics. Please contact an administrator.';
    }
    return error.message;
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load all incidents for statistics
      const incidents = await apiClient.getAllIncidents({
        limit: 1000, // Get all incidents for accurate stats
        includeUpdates: false,
      });

      const total = incidents.length;
      const resolved = incidents.filter(i => i.status === 'resolved').length;
      // P4 is monitoring status (not an actual incident), so exclude from active count
      const active = incidents.filter(i =>
        i.status !== 'resolved' &&
        ['P1', 'P2', 'P3'].includes(i.priority)
      ).length;
      const p1Count = incidents.filter(i => i.priority === 'P1').length;

      // Calculate byStatus counts
      const byStatus = {
        resolved: incidents.filter(i => i.status === 'resolved').length,
        investigating: incidents.filter(i => i.status === 'investigating').length,
        identified: incidents.filter(i => i.status === 'identified').length,
        monitoring: incidents.filter(i => i.status === 'monitoring').length,
      };

      // Calculate byPriority counts
      const byPriority = {
        P1: incidents.filter(i => i.priority === 'P1').length,
        P2: incidents.filter(i => i.priority === 'P2').length,
        P3: incidents.filter(i => i.priority === 'P3').length,
        P4: incidents.filter(i => i.priority === 'P4').length,
      };

      // Get recent activity (last 5 incidents sorted by created_at)
      const recentActivity = incidents
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map(incident => ({
          ...incident,
          action: incident.status === 'resolved' ? '해결됨' : '업데이트됨'
        }));

      setStats({
        total,
        resolved,
        active,
        p1Count,
        resolvedPercentage: total > 0 ? Math.round((resolved / total) * 100) : 0,
        byStatus,
        byPriority,
        recentActivity
      });

      if (DEV_CONFIG.logApiCalls) {
        console.log('Loaded incident stats from API:', { total, resolved, active, p1Count });
      }
    } catch (err) {
      const apiError = err as ApiError;

      // Fallback to mock data in development if API is unavailable or authentication fails
      if (DEV_CONFIG.mockDataFallback && (apiError.status === 0 || apiError.status >= 500 || apiError.status === 403 || apiError.status === 401)) {
        console.info('API error, falling back to mock data for stats');
        const total = mockIncidents.length;
        const resolved = mockIncidents.filter(i => i.status === 'resolved').length;
        // P4 is monitoring status (not an actual incident), so exclude from active count
        const active = mockIncidents.filter(i =>
          i.status !== 'resolved' &&
          ['P1', 'P2', 'P3'].includes(i.priority)
        ).length;
        const p1Count = mockIncidents.filter(i => i.priority === 'P1').length;

        // Calculate byStatus counts for mock data
        const byStatus = {
          resolved: mockIncidents.filter(i => i.status === 'resolved').length,
          investigating: mockIncidents.filter(i => i.status === 'investigating').length,
          identified: mockIncidents.filter(i => i.status === 'identified').length,
          monitoring: mockIncidents.filter(i => i.status === 'monitoring').length,
        };

        // Calculate byPriority counts for mock data
        const byPriority = {
          P1: mockIncidents.filter(i => i.priority === 'P1').length,
          P2: mockIncidents.filter(i => i.priority === 'P2').length,
          P3: mockIncidents.filter(i => i.priority === 'P3').length,
          P4: mockIncidents.filter(i => i.priority === 'P4').length,
        };

        setStats({
          total,
          resolved,
          active,
          p1Count,
          resolvedPercentage: Math.round((resolved / total) * 100),
          byStatus,
          byPriority,
          recentActivity: [...mockIncidents]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)
            .map(incident => ({
              ...incident,
              action: incident.status === 'resolved' ? '해결됨' : '업데이트됨'
            }))
        });
        setError(null);
      } else {
        console.error('Failed to load incident stats:', apiError);
        setError(handleAuthError(apiError));
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const refresh = loadStats;

  return { stats, loading, error, refresh };
};

// 자동저장 훅
export const useAutoSave = <T>(
  key: string,
  data: T,
  delay: number = 30000
) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (data && Object.keys(data as any).length > 0) {
        setIsSaving(true);
        
        try {
          localStorage.setItem(key, JSON.stringify(data));
          setLastSaved(new Date());
        } catch (error) {
          console.warn('Auto-save failed:', error);
        }
        
        setTimeout(() => setIsSaving(false), 1000);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [data, key, delay]);

  const clearSaved = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setLastSaved(null);
    } catch (error) {
      console.warn('Failed to clear saved data:', error);
    }
  }, [key]);

  const getSaved = useCallback((): T | null => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.warn('Failed to get saved data:', error);
      return null;
    }
  }, [key]);

  return {
    isSaving,
    lastSaved,
    clearSaved,
    getSaved
  };
};