'use client';

import dynamic from 'next/dynamic';

// Import the client component with ssr: false to prevent prerendering
// This ensures the component only loads on the client side, avoiding
// issues with Context initialization and API calls during build
const IncidentsClientPage = dynamic(() => import('./IncidentsClientPage'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Loading incidents...</p>
      </div>
    </div>
  ),
});

export default function IncidentsPage() {
  return <IncidentsClientPage />;
}