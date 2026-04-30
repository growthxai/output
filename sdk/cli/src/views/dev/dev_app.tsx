import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
import { isServiceFailed, isServiceHealthy, type ServiceStatus } from '#services/docker.js';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { openUrl } from '#utils/open_url.js';
import type { WorkflowSummary } from '#components/workflow_summary.js';
import {
  useHealthPolling,
  useStatusRefresh,
  useWorkflowRunsPolling
} from '#views/dev/hooks/use_poll.js';
import { useWorkflowCatalog } from '#views/dev/hooks/use_workflow_catalog.js';
import { Header, buildSummaryCounters, type ServiceBadge } from '#views/dev/chrome/header.js';
import { TabBar } from '#views/dev/chrome/tab_bar.js';
import { SearchBar } from '#views/dev/chrome/search_bar.js';
import { Toasts } from '#views/dev/chrome/toasts.js';
import { HorizontalRule } from '#views/dev/chrome/divider.js';
import { UiStateProvider, useUiState, type Tab } from '#views/dev/state/ui_state.js';
import { WorkflowsPanel } from '#views/dev/panels/workflows_panel.js';
import { RunsPanel } from '#views/dev/panels/runs_panel.js';
import { ServicesPanel } from '#views/dev/panels/services_panel.js';
import { HelpPanel } from '#views/dev/panels/help_panel.js';
import { RunModal } from '#views/dev/modals/run_modal.js';
import { ExpandedJsonModal } from '#views/dev/modals/expanded_json_modal.js';

export type Phase = 'waiting' | 'running' | 'failed';

const TAB_NUMBER_KEYS: Record<string, Tab> = {
  1: 'workflows',
  2: 'runs',
  3: 'services',
  4: 'help'
};

const useGlobalInput = ( opts: {
  onCleanup: () => Promise<void>;
} ): void => {
  const ui = useUiState();
  const { exit } = useApp();
  const isExitingRef = useRef( false );

  useInput( ( input, key ) => {
    // Ctrl+C is the universal escape hatch — handle it regardless of which
    // overlay is open so the user can always quit.
    if ( key.ctrl && input === 'c' && !isExitingRef.current ) {
      isExitingRef.current = true;
      void opts.onCleanup()
        .then( () => exit() )
        .catch( err => exit( err instanceof Error ? err : new Error( String( err ) ) ) );
      return;
    }

    if ( ui.search.open || ui.runModal.open || ui.expandedJson.open ) {
      return;
    }

    // Esc on a list view drops an active filter. Skip when we're on
    // the run detail sub-view — the panel's own esc handler pops back
    // to the list and the filter should still apply when we land
    // there. The search bar's esc (close + clear) returns above, so
    // it never reaches this branch.
    if ( key.escape && ui.search.query && ui.runsView === 'list' ) {
      ui.clearSearch();
      return;
    }

    // Switching tabs is treated as leaving the current view, so any
    // active filter goes with it. App-driven setTab calls (e.g. the
    // run modal pre-filtering Recent Runs to a workflow) bypass this
    // path on purpose.
    if ( key.tab || ( input && TAB_NUMBER_KEYS[input] ) ) {
      if ( ui.search.query ) {
        ui.clearSearch();
      }
    }

    if ( key.tab && key.shift ) {
      ui.prevTab();
      return;
    }
    if ( key.tab ) {
      ui.nextTab();
      return;
    }
    if ( input === '/' ) {
      ui.openSearch();
      return;
    }
    if ( input === '?' ) {
      ui.setTab( 'help' );
      return;
    }
    if ( input && TAB_NUMBER_KEYS[input] ) {
      ui.setTab( TAB_NUMBER_KEYS[input] );
      return;
    }
    if ( input === 'o' && ui.tab === 'services' ) {
      openUrl( 'http://localhost:8080' );
    }
  } );
};

const computeWorkflowSummary = ( runs: WorkflowRun[] ): WorkflowSummary | null => {
  if ( runs.length === 0 ) {
    return null;
  }
  return {
    running: runs.filter( r => r.status === 'running' ).length,
    completed: runs.filter( r => r.status === 'completed' ).length,
    failed: runs.filter( r => r.status === 'failed' ).length,
    total: runs.length
  };
};

const Shell: React.FC<{
  dockerComposePath: string;
  onCleanup: () => Promise<void>;
}> = ( { dockerComposePath, onCleanup } ) => {
  const { exit } = useApp();
  const ui = useUiState();
  const [ phase, setPhase ] = useState<Phase>( 'waiting' );
  const [ services, setServices ] = useState<ServiceStatus[]>( [] );
  const [ runs, setRuns ] = useState<WorkflowRun[]>( [] );

  useHealthPolling( dockerComposePath, phase === 'waiting', {
    onServices: setServices,
    onAllHealthy: () => setPhase( 'running' ),
    onFailure: () => setPhase( 'failed' ),
    onTimeout: () => exit( new Error( 'Timeout waiting for services to become healthy' ) )
  } );

  useStatusRefresh( dockerComposePath, phase !== 'waiting', setServices );
  useWorkflowRunsPolling( phase !== 'waiting', setRuns );
  const workflows = useWorkflowCatalog( phase !== 'waiting' );

  const autoSwitchedRef = useRef( false );
  const setTab = ui.setTab;
  useEffect( () => {
    if (
      phase === 'running' &&
      workflows.length > 0 &&
      !autoSwitchedRef.current &&
      ui.tab === 'services'
    ) {
      autoSwitchedRef.current = true;
      setTab( 'workflows' );
    }
  }, [ phase, workflows.length, ui.tab, setTab ] );

  useGlobalInput( { onCleanup } );

  const summary = useMemo( () => computeWorkflowSummary( runs ), [ runs ] );
  const failingServices = useMemo( () => services.filter( isServiceFailed ).length, [ services ] );
  const serviceBadge: ServiceBadge = useMemo( () => {
    if ( failingServices > 0 ) {
      return 'failed';
    }
    if ( phase === 'waiting' || services.length === 0 || !services.every( isServiceHealthy ) ) {
      return 'starting';
    }
    return 'healthy';
  }, [ phase, services, failingServices ] );
  const counters = buildSummaryCounters( summary, workflows.length, serviceBadge, failingServices );

  // `stdout.rows` is undefined on a small set of TTYs (mostly piped envs).
  // 60 is a generous default — chrome alone is ~10 rows, and run-detail
  // wants ~25 of content, so anything below 40 starts to clip step rows.
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 60;

  if ( ui.expandedJson.open ) {
    return (
      <Box flexDirection="column" height={rows} paddingX={2} paddingTop={1}>
        <ExpandedJsonModal />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows} paddingX={2} paddingTop={1}>
      <Header counters={counters} />
      <TabBar active={ui.tab} />
      <HorizontalRule />
      <SearchBar active={ui.search.open} />
      <Toasts />

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {ui.tab === 'workflows' && !ui.runModal.open && <WorkflowsPanel workflows={workflows} runs={runs} />}
        {ui.tab === 'runs' && !ui.runModal.open && <RunsPanel runs={runs} />}
        {ui.tab === 'services' && !ui.runModal.open && (
          <ServicesPanel phase={phase} services={services} dockerComposePath={dockerComposePath} />
        )}
        {ui.tab === 'help' && !ui.runModal.open && <HelpPanel />}

        {ui.runModal.open && <RunModal workflowName={ui.runModal.workflowName} />}
      </Box>
    </Box>
  );
};

export const DevApp: React.FC<{
  dockerComposePath: string;
  onCleanup: () => Promise<void>;
}> = ( { dockerComposePath, onCleanup } ) => (
  <UiStateProvider>
    <Shell dockerComposePath={dockerComposePath} onCleanup={onCleanup} />
  </UiStateProvider>
);
