import { NextRequest, NextResponse } from 'next/server';

// API route to get services status history based on real incidents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Build query parameters for the backend API
    const params = new URLSearchParams({
      days: '90',
      includeToday: 'true',
      ...Object.fromEntries(searchParams.entries())
    });

    // Call the backend API (verify-monitor-api)
    // Use environment variable for flexible configuration
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const backendUrl = `${apiBaseUrl}/services/status-history?${params.toString()}`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);

      return NextResponse.json({
        success: false,
        error: 'Backend API unavailable',
        message: `Failed to connect to backend API: ${response.status} ${response.statusText}`,
        timestamp: new Date().toISOString(),
      }, { status: 502 });
    }

    const data = await response.json();

    // Add source indicator
    const responseData = {
      ...data,
      source: 'api'
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('API route error:', error);

    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to connect to backend API',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

