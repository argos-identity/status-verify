import type { Incident, IncidentUpdate, IncidentFilters } from './types';

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://verify-status.argosidentity.io:3001/api';

// API Response wrapper type
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
  responseTime?: string;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
  filters?: Record<string, any>;
}

// API Error type
export interface ApiError {
  status: number;
  message: string;
  details?: any;
  code?: string;
  userRole?: string;
  userPermissions?: string[];
}

// HTTP Client class
class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Set authentication token
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  // Generic fetch wrapper with error handling
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add authorization header if auth token is available
    // All API endpoints require authentication for proper permission checking
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const defaultOptions: RequestInit = {
      headers,
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle authentication errors specifically
        if (response.status === 401) {
          // In development mode with mock fallback, this is expected behavior
          const isDevelopmentWithFallback = process.env.NODE_ENV === 'development';
          if (isDevelopmentWithFallback) {
            console.debug('401 Unauthorized - will fallback to mock data in development');
          }

          throw {
            status: response.status,
            message: errorData.message || 'No valid authorization header found',
            details: errorData.details,
            code: errorData.code || 'AUTHENTICATION_REQUIRED',
          } as ApiError;
        }

        // Handle permission errors specifically
        if (response.status === 403) {
          // In development mode with mock fallback, this is expected behavior
          const isDevelopmentWithFallback = process.env.NODE_ENV === 'development';
          if (isDevelopmentWithFallback) {
            console.debug('403 Forbidden - will fallback to mock data in development');
          }

          throw {
            status: response.status,
            message: errorData.message || 'Permission denied. You do not have access to this resource.',
            details: errorData.details,
            code: errorData.code || 'PERMISSION_DENIED',
            userRole: errorData.userRole,
            userPermissions: errorData.userPermissions,
          } as ApiError;
        }

        throw {
          status: response.status,
          message: errorData.message || `HTTP Error: ${response.status}`,
          details: errorData.details,
        } as ApiError;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw {
          status: 0,
          message: 'Network error: Unable to connect to the server',
          details: `Please check if the Backend API server is running on ${API_BASE_URL}`,
        } as ApiError;
      }
      throw error;
    }
  }

  // GET all incidents - maps to /api/incidents/detail
  async getAllIncidents(filters?: {
    limit?: number;
    offset?: number;
    severity?: string;
    serviceId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    includeUpdates?: boolean;
  }): Promise<Incident[]> {
    const queryParams = new URLSearchParams();

    if (filters?.limit) queryParams.append('limit', filters.limit.toString());
    if (filters?.offset) queryParams.append('offset', filters.offset.toString());
    if (filters?.severity) queryParams.append('severity', filters.severity);
    if (filters?.serviceId) queryParams.append('serviceId', filters.serviceId);
    if (filters?.sortBy) queryParams.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) queryParams.append('sortOrder', filters.sortOrder);
    if (filters?.includeUpdates !== undefined) {
      queryParams.append('includeUpdates', filters.includeUpdates.toString());
    }

    const endpoint = `/incidents/detail${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<ApiResponse<Incident[]>>(endpoint, {}, false);

    return response.data;
  }

  // GET single incident by ID
  async getIncident(incidentId: string, options?: {
    includeUpdates?: boolean;
    includeTimeline?: boolean;
  }): Promise<Incident | null> {
    const queryParams = new URLSearchParams();

    if (options?.includeUpdates !== undefined) {
      queryParams.append('includeUpdates', options.includeUpdates.toString());
    }
    if (options?.includeTimeline !== undefined) {
      queryParams.append('includeTimeline', options.includeTimeline.toString());
    }

    const endpoint = `/incidents/${incidentId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    try {
      const response = await this.request<ApiResponse<Incident>>(endpoint, {}, false);
      return response.data;
    } catch (error) {
      if ((error as ApiError).status === 404) {
        return null;
      }
      // Allow 403 errors to be thrown for proper error handling
      throw error;
    }
  }

  // GET incident updates
  async getIncidentUpdates(incidentId: string, options?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
  }): Promise<IncidentUpdate[]> {
    const queryParams = new URLSearchParams();

    if (options?.limit) queryParams.append('limit', options.limit.toString());
    if (options?.offset) queryParams.append('offset', options.offset.toString());
    if (options?.orderBy) queryParams.append('orderBy', options.orderBy);
    if (options?.orderDirection) queryParams.append('orderDirection', options.orderDirection);

    const endpoint = `/incidents/${incidentId}/updates${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    try {
      const response = await this.request<ApiResponse<IncidentUpdate[]>>(endpoint, {}, false);
      return response.data;
    } catch (error) {
      if ((error as ApiError).status === 404) {
        return [];
      }
      // Allow 403 errors to be thrown for proper error handling
      throw error;
    }
  }

  // GET past incidents (resolved only)
  async getPastIncidents(options?: {
    limit?: number;
    offset?: number;
    severity?: string;
    serviceId?: string;
    timeRange?: string;
  }): Promise<Incident[]> {
    const queryParams = new URLSearchParams();

    if (options?.limit) queryParams.append('limit', options.limit.toString());
    if (options?.offset) queryParams.append('offset', options.offset.toString());
    if (options?.severity) queryParams.append('severity', options.severity);
    if (options?.serviceId) queryParams.append('serviceId', options.serviceId);
    if (options?.timeRange) queryParams.append('timeRange', options.timeRange);

    const endpoint = `/incidents/past${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<ApiResponse<Incident[]>>(endpoint);

    return response.data;
  }

  // GET active incidents (non-resolved)
  async getActiveIncidents(options?: {
    severity?: string;
    serviceId?: string;
    assignedTo?: string;
  }): Promise<Incident[]> {
    const queryParams = new URLSearchParams();

    if (options?.severity) queryParams.append('severity', options.severity);
    if (options?.serviceId) queryParams.append('serviceId', options.serviceId);
    if (options?.assignedTo) queryParams.append('assignedTo', options.assignedTo);

    const endpoint = `/incidents/active${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.request<ApiResponse<Incident[]>>(endpoint);

    return response.data;
  }

  // GET incidents by date
  async getIncidentsByDate(date: string, serviceId?: string): Promise<{
    date: string;
    incidents: Incident[];
    count: number;
  }> {
    const queryParams = new URLSearchParams();
    queryParams.append('date', date);
    if (serviceId) queryParams.append('serviceId', serviceId);

    const endpoint = `/incidents/by-date?${queryParams.toString()}`;
    const response = await this.request<ApiResponse<{
      date: string;
      incidents: Incident[];
      count: number;
    }>>(endpoint);

    return response.data;
  }

  // POST create new incident (for future use when authentication is added)
  async createIncident(incidentData: Partial<Incident>): Promise<Incident> {
    const response = await this.request<ApiResponse<Incident>>('/incidents', {
      method: 'POST',
      body: JSON.stringify(incidentData),
    }, true);

    return response.data;
  }

  // PUT update incident (for future use when authentication is added)
  async updateIncident(incidentId: string, updateData: Partial<Incident>): Promise<Incident> {
    const response = await this.request<ApiResponse<Incident>>(`/incidents/${incidentId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    }, true);

    return response.data;
  }

  // POST add incident update (for future use when authentication is added)
  async addIncidentUpdate(incidentId: string, updateData: Partial<IncidentUpdate>): Promise<IncidentUpdate> {
    const response = await this.request<ApiResponse<IncidentUpdate>>(`/incidents/${incidentId}/updates`, {
      method: 'POST',
      body: JSON.stringify(updateData),
    }, true);

    return response.data;
  }

  // DELETE incident
  async deleteIncident(incidentId: string): Promise<Incident> {
    const response = await this.request<ApiResponse<Incident>>(`/incidents/${incidentId}`, {
      method: 'DELETE',
    }, true);

    return response.data;
  }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;