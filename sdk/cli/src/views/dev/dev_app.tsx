import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { isServiceFailed, isServiceHealthy, type ServiceStatus } from '#services/docker.js';
import type { WorkflowRun } from '#services/workflow_runs.js';
import {
  useHealthPolling,
  useStatusRefresh,
  useWorkflowRunsPolling
} from '#views/dev/hooks/use_poll.js';
import { useWorkflowCatalog } from '#views/dev/hooks/use_workflow_catalog.js';
import {
  Header,
  buildSummaryCounters,
  getHeight as getHeaderHeight,
  type ServiceBadge,
  type WorkflowSummary
} from '#views/dev/chrome/header.js';
import { TabBar, getHeight as getTabBarHeight } from '#views/dev/chrome/tab_bar.js';
import { SearchBar, useHeight as useSearchBarHeight } from '#views/dev/chrome/search_bar.js';
import { Toasts, useHeight as useToastsHeight } from '#views/dev/chrome/toasts.js';
import { Footer, getHeight as getFooterHeight, type FooterState } from '#views/dev/chrome/footer.js';
import { RULE_PURPLE } from '#views/dev/chrome/palette.js';
import { UiStateProvider, useUiState, type Tab, type UiState } from '#views/dev/state/ui_state.js';
import {
  WorkflowsPanel,
  WORKFLOWS_HINTS,
  WORKFLOWS_LOADING_HINTS,
  buildVisibleWorkflows
} from '#views/dev/panels/workflows_panel.js';
import { RunsPanel, RUNS_EMPTY_HINTS, RUNS_HINTS, buildVisibleRuns } from '#views/dev/panels/runs_panel.js';
import { ServicesPanel, SERVICES_BOOT_HINTS, SERVICES_HINTS } from '#views/dev/panels/services_panel.js';
import { HELP_HINTS, HELP_SECTION_COUNT, HelpPanel } from '#views/dev/panels/help_panel.js';
import { RunModal } from '#views/dev/modals/run_modal.js';
import { ExpandedJsonModal } from '#views/dev/modals/expanded_json_modal.js';
import { StepsModal } from '#views/dev/modals/steps_modal.js';
import { StepGraphModal } from '#views/dev/modals/step_graph_modal.js';
import { MIN_TERMINAL_COLUMNS, MIN_TERMINAL_ROWS } from '#views/dev/utils/ui_constants.js';

export type Phase = 'waiting' | 'running' | 'failed';

const TAB_NUMBER_KEYS: Record<string, Tab> = {
  1: 'workflows',
  2: 'runs',
  3: 'services',
  4: 'help'
};

const getContentRows = ( opts: {
  rows: number;
  searchHeight: number;
  toastsHeight: number;
} ): number => {
  return Math.max(
    1,
    opts.rows -
      getHeaderHeight( opts.rows ) -
      getTabBarHeight() -
      opts.searchHeight -
      opts.toastsHeight -
      getFooterHeight()
  );
};

const useTerminalSize = (): { rows: number; cols: number } => {
  const { stdout } = useStdout();
  const readSize = (): { rows: number; cols: number } => ( {
    rows: stdout?.rows ?? 60,
    cols: stdout?.columns ?? 80
  } );
  const [ size, setSize ] = useState( readSize );

  useEffect( () => {
    const update = (): void => setSize( readSize() );

    update();
    stdout?.on( 'resize', update );
    return () => {
      stdout?.off( 'resize', update );
    };
  }, [ stdout ] );

  return size;
};

const TerminalTooSmall: React.FC<{ rows: number; cols: number }> = ( { rows, cols } ) => (
  <Box flexDirection="column" paddingX={1} paddingTop={1}>
    <Text bold>Terminal too small for Output dev UI.</Text>
    <Text dimColor>
      Resize to at least {MIN_TERMINAL_COLUMNS}x{MIN_TERMINAL_ROWS} characters.
      Current size: {cols}x{rows}.
    </Text>
  </Box>
);

const useGlobalInput = ( opts: {
  onCleanup: () => Promise<void>;
  runDetailOpen: boolean;
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

    if ( ui.search.open || ui.runModal.open || ui.expandedJson.open || ui.stepGraph.open || opts.runDetailOpen ) {
      return;
    }

    // Esc on a list view drops an active filter. Skip when we're on
    // the run detail sub-view — the panel's own esc handler pops back
    // to the list and the filter should still apply when we land
    // there. The search bar's esc (close + clear) returns above, so
    // it never reaches this branch.
    if ( key.escape && ui.search.query && !opts.runDetailOpen ) {
      ui.clearSearch();
      return;
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

const footerFor = ( opts: {
  ui: UiState;
  workflowCount: number;
  visibleWorkflowCount: number;
  runCount: number;
  visibleRunCount: number;
  serviceCount: number;
  phase: Phase;
} ): FooterState => {
  if ( opts.ui.tab === 'workflows' ) {
    if ( opts.workflowCount === 0 ) {
      return { hints: WORKFLOWS_LOADING_HINTS };
    }
    return { hints: WORKFLOWS_HINTS, itemCount: opts.visibleWorkflowCount, itemLabel: 'workflows' };
  }
  if ( opts.ui.tab === 'runs' ) {
    if ( opts.runCount === 0 ) {
      return { hints: RUNS_EMPTY_HINTS };
    }
    return { hints: RUNS_HINTS, itemCount: opts.visibleRunCount, itemLabel: 'runs' };
  }
  if ( opts.ui.tab === 'services' ) {
    return {
      hints: opts.phase === 'waiting' && opts.serviceCount === 0 ? SERVICES_BOOT_HINTS : SERVICES_HINTS,
      itemCount: opts.serviceCount,
      itemLabel: 'services'
    };
  }
  return { hints: HELP_HINTS, itemCount: HELP_SECTION_COUNT, itemLabel: 'sections' };
};

const overlayFor = ( opts: {
  ui: UiState;
  detailRun: WorkflowRun | undefined;
  stepGraphRun: WorkflowRun | undefined;
  runDetailOpen: boolean;
  rows: number;
} ): React.ReactNode => {
  // expandedJson sits on top of everything — it's popped from another overlay
  // (e.g. the step graph's `e`), so it must win when both are open.
  if ( opts.ui.expandedJson.open ) {
    return <ExpandedJsonModal />;
  }
  if ( opts.ui.stepGraph.open && opts.stepGraphRun ) {
    return <StepGraphModal run={opts.stepGraphRun} height={opts.rows} />;
  }
  if ( opts.ui.runModal.open ) {
    return <RunModal workflowName={opts.ui.runModal.workflowName} workflowPath={opts.ui.runModal.workflowPath} />;
  }
  if ( opts.ui.tab === 'runs' && opts.runDetailOpen && opts.detailRun ) {
    return <StepsModal run={opts.detailRun} height={opts.rows} />;
  }
  return null;
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

  const summary = useMemo( () => computeWorkflowSummary( runs ), [ runs ] );
  const visibleWorkflows = useMemo(
    () => buildVisibleWorkflows( workflows, ui.search.query ),
    [ workflows, ui.search.query ]
  );
  const visibleRuns = useMemo(
    () => buildVisibleRuns( runs, ui.search.query ),
    [ runs, ui.search.query ]
  );
  const detailRun = ui.runsView === 'detail' ?
    runs.find( r => r.runId === ui.selection.runId && r.workflowId === ui.selection.workflowId ) :
    undefined;
  const runDetailOpen = ui.runsView === 'detail' && detailRun !== undefined;
  // Re-resolve the step-graph run from the polled list each render so its
  // status/duration stay live; fall back to the snapshot captured at open.
  const stepGraphRun = useMemo( () => {
    const captured = ui.stepGraph.open ? ui.stepGraph.run : null;
    return captured ?
      ( runs.find( r => r.runId === captured.runId && r.workflowId === captured.workflowId ) ?? captured ) :
      undefined;
  }, [ ui.stepGraph.open, ui.stepGraph.run, runs ] );

  useGlobalInput( { onCleanup, runDetailOpen } );
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
  const { rows, cols } = useTerminalSize();
  const searchHeight = useSearchBarHeight();
  const toastsHeight = useToastsHeight();
  const terminalTooSmall = cols < MIN_TERMINAL_COLUMNS || rows < MIN_TERMINAL_ROWS;
  const contentRows = getContentRows( {
    rows,
    searchHeight,
    toastsHeight
  } );
  const footer = footerFor( {
    ui,
    workflowCount: workflows.length,
    visibleWorkflowCount: visibleWorkflows.length,
    runCount: runs.length,
    visibleRunCount: visibleRuns.length,
    serviceCount: services.length,
    phase
  } );
  const overlay = overlayFor( { ui, detailRun, stepGraphRun, runDetailOpen, rows } );

  if ( terminalTooSmall ) {
    return <TerminalTooSmall rows={rows} cols={cols} />;
  }

  if ( overlay ) {
    return (
      <Box flexDirection="column" height={rows} paddingX={1}>
        {overlay}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Header counters={counters} />
      <TabBar active={ui.tab} borderColor={RULE_PURPLE} />
      <SearchBar active={ui.search.open} />

      <Box flexDirection="column" flexGrow={1} height={contentRows} overflow="hidden">
        {ui.tab === 'workflows' && <WorkflowsPanel workflows={workflows} runs={runs} />}
        {ui.tab === 'runs' && <RunsPanel runs={runs} height={contentRows} />}
        {ui.tab === 'services' && (
          <ServicesPanel height={contentRows} phase={phase} services={services} dockerComposePath={dockerComposePath} />
        )}
        {ui.tab === 'help' && <HelpPanel />}
      </Box>
      <Toasts />
      <Footer hints={footer.hints} itemCount={footer.itemCount} itemLabel={footer.itemLabel} />
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
