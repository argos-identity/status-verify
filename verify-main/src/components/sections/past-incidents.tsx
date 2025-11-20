'use client';

import React from 'react';
import PaginatedIncidentHistory from './paginated-incident-history';
import { useIncidentHistory } from '../../hooks/use-incident-history';

const PastIncidents = () => {
  const { incidents, isLoading, error } = useIncidentHistory();

  // Filter for active incidents (investigating, identified, monitoring) for Active Incidents section
  const activeIncidents = incidents.filter(incident =>
    incident.status === 'investigating' ||
    incident.status === 'identified' ||
    incident.status === 'monitoring'
  );

  return (
    <div className="mt-16">
      <PaginatedIncidentHistory
        incidents={activeIncidents}
        isLoading={isLoading}
        error={error ? error : undefined}
      />
    </div>
  );
};

export default PastIncidents;