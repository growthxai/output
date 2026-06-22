import React, { useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { WorkflowStatusIcon, workflowStatusColor } from '#views/dev/components/workflow_status.js';
import { elapsedMs, formatDurationCompact } from '#utils/date_formatter.js';
import { openUrl } from '#utils/open_url.js';
import { TabBar, getHeight as getTabBarHeight, type TabBarItem } from '#views/dev/chrome/tab_bar.js';
import { ContentTitle, getHeight as getContentTitleHeight } from '#views/dev/components/content_title.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState, type RunListPaneTab } from '#views/dev/state/ui_state.js';
import { useRunDetail } from '#views/dev/hooks/use_run_detail.js';
import { JsonView } from '#views/dev/utils/json_render.js';
import { RunInfoSidebar } from '#views/dev/components/run_info_sidebar.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import {
  capitalize,
  cycleValue,
  formatContentTitle,
  formatStartedShort,
  hasJsonValue,
  truncate,
  useListSelection
} from '#views/dev/utils/panel_helpers.js';
import { CATALOG_WORKFLOW_NAME, RUNS_VISIBLE_ROWS } from '#views/dev/utils/constants.js';

const TEMPORAL_UI_BASE = 'http://localhost:8080';

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  failed: 1,
  timed_out: 2,
  terminated: 3,
  canceled: 4,
  continued_as_new: 5,
  completed: 6
};

const sortRuns = ( runs: WorkflowRun[] ): WorkflowRun[] =>
  [ ...runs ].sort( ( a, b ) => {
    const statusDiff = ( STATUS_ORDER[a.status ?? ''] ?? Infinity ) - ( STATUS_ORDER[b.status ?? ''] ?? Infinity );
    if ( statusDiff !== 0 ) {
      return statusDiff;
    }
    const aTime = a.startedAt ? new Date( a.startedAt ).getTime() : 0;
    const bTime = b.startedAt ? new Date( b.startedAt ).getTime() : 0;
    return bTime - aTime;
  } );

const matchesFilter = ( run: WorkflowRun, query: string ): boolean => {
  if ( !query ) {
    return true;
  }
  const q = query.toLowerCase();
  return ( run.workflowType ?? '' ).toLowerCase().includes( q ) ||
    ( run.workflowId ?? '' ).toLowerCase().includes( q ) ||
    ( run.status ?? '' ).toLowerCase().includes( q );
};

export const buildVisibleRuns = ( runs: WorkflowRun[], query: string ): WorkflowRun[] => {
  const visible = runs.filter( r => !( r.workflowType === CATALOG_WORKFLOW_NAME && r.status === 'completed' ) );
  const filtered = query ? visible.filter( r => matchesFilter( r, query ) ) : visible;
  return sortRuns( filtered );
};

const COL = {
  indicator: 3,
  icon: 3,
  status: 11,
  type: 22,
  id: 26,
  duration: 9,
  started: 14
};

const RUN_INFO_TABS: TabBarItem[] = [
  { id: 'status', label: 'Status' },
  { id: 'input', label: 'Input' },
  { id: 'output', label: 'Output' }
];

const RUN_INFO_TAB_ORDER: RunListPaneTab[] = [ 'status', 'input', 'output' ];

const HeaderRow: React.FC = () => (
  <Box>
    <Box width={COL.indicator}><Text>&nbsp;</Text></Box>
    <Box width={COL.icon}><Text>&nbsp;</Text></Box>
    <Box width={COL.status}><Text dimColor bold>STATUS</Text></Box>
    <Box width={COL.type}><Text dimColor bold>TYPE</Text></Box>
    <Box width={COL.id}><Text dimColor bold>ID</Text></Box>
    <Box width={COL.duration} justifyContent="flex-end"><Text dimColor bold>DURATION</Text></Box>
    <Box width={COL.started} marginLeft={2}><Text dimColor bold>STARTED</Text></Box>
  </Box>
);

const RunRow: React.FC<{ run: WorkflowRun; selected: boolean }> = ( { run, selected } ) => {
  const status = run.status ?? 'running';
  const color = workflowStatusColor( status );
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';

  return (
    <Box>
      <Box width={COL.indicator}>
        <SelectionIndicator selected={selected} />
      </Box>
      <Box width={COL.icon}><WorkflowStatusIcon status={status} /></Box>
      <Box width={COL.status}><Text color={color}>{status}</Text></Box>
      <Box width={COL.type}><Text bold={selected}>{truncate( run.workflowType ?? '-', COL.type - 1 )}</Text></Box>
      <Box width={COL.id}><Text dimColor={!selected}>{truncate( run.workflowId ?? '-', COL.id - 1 )}</Text></Box>
      <Box width={COL.duration} justifyContent="flex-end"><Text dimColor={!selected}>{duration}</Text></Box>
      <Box width={COL.started} marginLeft={2}><Text dimColor={!selected}>{formatStartedShort( run.startedAt )}</Text></Box>
    </Box>
  );
};

interface RunPaneData {
  input: unknown;
  output: unknown;
  error: unknown;
  status: string;
  loading: boolean;
}

const statusPaneValue = ( run: WorkflowRun, pane: RunPaneData ): unknown => ( {
  status: pane.status,
  runId: run.runId,
  workflowId: run.workflowId,
  workflowType: run.workflowType,
  startedAt: run.startedAt,
  completedAt: run.completedAt
} );

const runPaneValue = ( run: WorkflowRun, pane: RunPaneData, activePane: RunListPaneTab ): unknown => {
  if ( activePane === 'status' ) {
    return statusPaneValue( run, pane );
  }
  if ( activePane === 'input' ) {
    return pane.input;
  }
  // 'output'
  return pane.error ?? pane.output;
};

const DetailPane: React.FC<{
  run: WorkflowRun | undefined;
  pane: RunPaneData | null;
  rows: number;
}> = ( { run, pane, rows } ) => {
  const ui = useUiState();

  if ( !run || !pane ) {
    return (
      <Box>
        <Text dimColor>Select a run to see details.</Text>
      </Box>
    );
  }
  const { loading } = pane;
  const activePane = ui.runListPaneTab;
  const tabContentRows = Math.max( 1, rows - getContentTitleHeight() - getTabBarHeight() );
  const tabs = hasJsonValue( pane.error ) ?
    RUN_INFO_TABS.map( tab => tab.id === 'output' ? { ...tab, label: 'Error' } : tab ) :
    RUN_INFO_TABS;

  const renderPane = (): React.ReactNode => {
    if ( activePane === 'status' ) {
      return <RunInfoSidebar run={run} resultStatus={pane.status} maxRows={tabContentRows} />;
    }
    const value = runPaneValue( run, pane, activePane );
    if ( value === undefined || value === null ) {
      if ( loading ) {
        return <LoadingSpinner />;
      }
      return <Text dimColor>—</Text>;
    }
    if ( activePane === 'output' && hasJsonValue( pane.error ) ) {
      const lines = String( pane.error ).split( '\n' ).slice( 0, tabContentRows );
      return (
        <Box flexDirection="column">
          {lines.map( ( line, i ) => (
            <Text key={i} color="red" wrap="truncate-end">{line}</Text>
          ) )}
        </Box>
      );
    }
    return <JsonView value={value} maxLines={tabContentRows} truncateLine />;
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <ContentTitle title={formatContentTitle( [ `Workflow "${run.workflowType}"`, 'Result' ] )} />
      <TabBar active={activePane} items={tabs} />
      {renderPane()}
    </Box>
  );
};

export const RUNS_HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'enter', label: 'open' },
  { key: 'g', label: 'graph' },
  { key: '←/→', label: 'switch pane' },
  { key: 'e', label: 'expand' },
  { key: 'o', label: 'temporal' }
];

export const RUNS_EMPTY_HINTS = [];

export const RunsPanel: React.FC<{ runs: WorkflowRun[]; height: number }> = ( { runs, height } ) => {
  const ui = useUiState();

  const filteredRuns = useMemo(
    () => buildVisibleRuns( runs, ui.search.query ),
    [ runs, ui.search.query ]
  );

  const initialIndex = (): number => {
    const previousRunId = ui.selection.runId;
    if ( !previousRunId ) {
      return 0;
    }
    const initial = buildVisibleRuns( runs, ui.search.query );
    const i = initial.findIndex( r => r.runId === previousRunId );
    return i >= 0 ? i : 0;
  };

  const { selectedIndex: clampedIndex, selectPrevious, selectNext } = useListSelection( filteredRuns.length, initialIndex );
  const selectedRun = filteredRuns[clampedIndex];
  const { result, loading } = useRunDetail( selectedRun?.workflowId, selectedRun?.runId, selectedRun?.status );

  const pane: RunPaneData | null = selectedRun ? {
    input: result?.input,
    output: result?.output,
    error: result?.error,
    status: result?.status ?? selectedRun.status ?? 'unknown',
    loading
  } : null;

  const setSelection = ui.setSelection;
  useEffect( () => {
    setSelection( {
      runId: selectedRun?.runId,
      workflowId: selectedRun?.workflowId,
      workflowName: selectedRun?.workflowType
    } );
  }, [ selectedRun?.runId, selectedRun?.workflowId, selectedRun?.workflowType, setSelection ] );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      selectPrevious();
      return;
    }
    if ( key.downArrow ) {
      selectNext();
      return;
    }
    if ( input === 'o' && selectedRun?.workflowId ) {
      openUrl( `${TEMPORAL_UI_BASE}/namespaces/default/workflows/${selectedRun.workflowId}` );
      return;
    }
    if ( key.return && selectedRun?.workflowId ) {
      ui.setRunsView( 'detail' );
      return;
    }
    if ( input === 'g' && selectedRun?.workflowId ) {
      ui.openStepGraph( selectedRun );
      return;
    }
    if ( key.leftArrow || key.rightArrow ) {
      ui.setRunListPaneTab( cycleValue( RUN_INFO_TAB_ORDER, ui.runListPaneTab, key.rightArrow ? 1 : -1 ) );
      return;
    }
    if ( input === 'e' && pane ) {
      const activePane = ui.runListPaneTab;
      const content = selectedRun ? runPaneValue( selectedRun, pane, activePane ) : null;
      const title = formatContentTitle( [ 'Recent Runs', `Workflow "${selectedRun?.workflowType ?? ''}"`, capitalize( activePane ) ] );
      ui.openExpandedJson( content, title );
    }
  }, { isActive: ui.tab === 'runs' && ui.runsView === 'list' && !ui.search.open && !ui.stepGraph.open } );

  if ( runs.length === 0 ) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No runs yet. Trigger one from the Workflows tab or with `output workflow run …`.</Text>
      </Box>
    );
  }

  if ( filteredRuns.length === 0 ) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No runs match `{ui.search.query}`. Press <Text bold>esc</Text> to clear the filter.</Text>
      </Box>
    );
  }

  return (
    <MasterDetailPanel
      items={filteredRuns}
      selectedIndex={clampedIndex}
      height={height}
      visibleRows={RUNS_VISIBLE_ROWS}
      renderHeader={() => <HeaderRow />}
      renderRow={( run, selected ) => <RunRow run={run} selected={selected} />}
      rowKey={( run, i ) => `${run.workflowId}-${run.runId ?? run.startedAt}-${i}`}
      detail={( { detailRows } ) => <DetailPane run={selectedRun} pane={pane} rows={detailRows} />}
    />
  );
};
