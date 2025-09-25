import { NextRequest, NextResponse } from 'next/server';

// API route to get all incident details from backend
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Build query parameters for the backend API
    const params = new URLSearchParams({
      limit: '100',
      includeUpdates: 'true',
      sortBy: 'created_at',
      sortOrder: 'desc',
      ...Object.fromEntries(searchParams.entries())
    });

    // Call the backend API (verify-monitor-api on port 3001)
    const backendUrl = `http://localhost:3001/api/incidents/detail?${params.toString()}`;

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

