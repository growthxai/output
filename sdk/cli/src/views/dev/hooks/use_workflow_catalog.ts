import { useState } from 'react';
import {
  getWorkflowCatalog,
  type GetWorkflowCatalog200,
  type Workflow
} from '#api/generated/api.js';
import { usePoll } from '#views/dev/hooks/use_poll.js';

const CATALOG_INTERVAL_MS = 10_000;

export const useWorkflowCatalog = ( enabled: boolean ): Workflow[] => {
  const [ workflows, setWorkflows ] = useState<Workflow[]>( [] );

  usePoll( enabled, CATALOG_INTERVAL_MS, async () => {
    try {
      const response = await getWorkflowCatalog();
      const data = response?.data as GetWorkflowCatalog200 | undefined;
      if ( data?.workflows ) {
        setWorkflows( data.workflows );
      }
    } catch {
      // API may not be ready yet
    }
    return 'continue';
  } );

  return workflows;
};
