// API Configuration for verify-incidents application

// Backend API Base URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3001/api';

// API Endpoints
export const API_ENDPOINTS = {
  // Incidents
  incidents: {
    all: '/incidents/detail',
    byId: (id: string) => `/incidents/${id}`,
    updates: (id: string) => `/incidents/${id}/updates`,
    past: '/incidents/past',
    active: '/incidents/active',
    byDate: '/incidents/by-date',
    create: '/incidents',
    update: (id: string) => `/incidents/${id}`,
    delete: (id: string) => `/incidents/${id}`,
    assign: (id: string) => `/incidents/${id}/assign`,
    escalate: (id: string) => `/incidents/${id}/escalate`,
  },

  // Services (for future use)
  services: {
    all: '/services',
    byId: (id: string) => `/services/${id}`,
    status: '/services/status',
  },

  // System (for future use)
  system: {
    status: '/system/status',
    health: '/system/health',
  },

  // Authentication (for future use)
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    profile: '/auth/profile',
  },
} as const;

// Request Configuration
export const REQUEST_CONFIG = {
  timeout: 10000, // 10 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second

  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
} as const;

// Default query parameters
export const DEFAULT_QUERY_PARAMS = {
  incidents: {
    limit: 100,
    offset: 0,
    sortBy: 'created_at',
    sortOrder: 'desc' as const,
    includeUpdates: true,
  },

  updates: {
    limit: 50,
    offset: 0,
    orderBy: 'created_at',
    orderDirection: 'desc' as const,
  },

  pastIncidents: {
    limit: 50,
    offset: 0,
    timeRange: '90d',
  },
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  network: 'Network error: Unable to connect to the server',
  timeout: 'Request timeout: The server is taking too long to respond',
  server: 'Server error: Something went wrong on the server',
  notFound: 'Resource not found',
  validation: 'Validation error: Please check your input',
  unauthorized: 'Unauthorized: Please log in to continue',
  forbidden: 'Forbidden: You do not have permission to perform this action',
  unknown: 'An unexpected error occurred',
} as const;

// Status mappings
export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: ERROR_MESSAGES.validation,
  401: ERROR_MESSAGES.unauthorized,
  403: ERROR_MESSAGES.forbidden,
  404: ERROR_MESSAGES.notFound,
  408: ERROR_MESSAGES.timeout,
  500: ERROR_MESSAGES.server,
  502: ERROR_MESSAGES.server,
  503: ERROR_MESSAGES.server,
  504: ERROR_MESSAGES.timeout,
} as const;

// Development settings
export const DEV_CONFIG = {
  logApiCalls: process.env.NODE_ENV === 'development',
  logErrors: true,
  mockDataFallback: process.env.NODE_ENV === 'development',
} as const;