"use client"

import { useSession } from 'next-auth/react'
import { useEffect } from 'react'
import apiClient from './api-client'

/**
 * Hook to automatically inject auth token into API client
 * Call this hook at the top level of any component that makes API calls
 */
export function useApiAuth() {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      // Automatically set token when session is available
      apiClient.setAuthToken(session.accessToken as string)
    } else if (status === 'unauthenticated') {
      // Clear token when unauthenticated
      apiClient.setAuthToken(null)
    }
  }, [session, status])

  return { session, status }
}
