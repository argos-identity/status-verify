'use client';

import React from 'react';
import Header from '@/components/sections/header';
import Footer from '@/components/sections/footer';
import IncidentHistory from '@/components/sections/incident-history';
import { useIncidentHistory } from '@/hooks/use-incident-history';

export default function IncidentsPage() {
  const { incidents, isLoading, error } = useIncidentHistory();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-[850px] px-10">
        <div className="py-8">
          <IncidentHistory
            incidents={incidents}
            isLoading={isLoading}
            error={error ?? undefined}
            showAllIncidents={true}
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}