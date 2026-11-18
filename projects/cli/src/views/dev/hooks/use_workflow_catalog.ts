import { useState } from 'react';
import { type Workflow } from '#api/generated/api.js';
import { fetchWorkflowCatalog } from '#api/workflow_catalog.js';
import { usePoll } from '#views/dev/hooks/use_poll.js';

const CATALOG_INTERVAL_MS = 10_000;

export const useWorkflowCatalog = ( enabled: boolean ): Workflow[] => {
  const [ workflows, setWorkflows ] = useState<Workflow[]>( [] );

  usePoll( enabled, CATALOG_INTERVAL_MS, async () => {
    try {
      setWorkflows( await fetchWorkflowCatalog() );
    } catch {
      // API may not be ready yet
    }
    return 'continue';
  } );

  return workflows;
};
