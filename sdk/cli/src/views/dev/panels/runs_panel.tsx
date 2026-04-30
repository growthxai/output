import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { StatusIcon, statusColor } from '#components/status_icon.js';
import { elapsedMs, formatDurationCompact, formatDate } from '#utils/date_formatter.js';
import { openUrl } from '#utils/open_url.js';
import { Footer } from '#views/dev/chrome/footer.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { RunDetailView } from '#views/dev/panels/run_detail_view.js';
import { useRunDetail } from '#views/dev/hooks/use_run_detail.js';
import { JsonView } from '#views/dev/utils/json_render.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import { truncate, formatStartedShort } from '#views/dev/utils/panel_helpers.js';
import { CATALOG_WORKFLOW_NAME, RUNS_VISIBLE_ROWS, RUNS_PREVIEW_LINES } from '#views/dev/utils/constants.js';
import type { TraceData, DebugNode } from '#types/trace.js';

const TEMPORAL_UI_BASE = 'http://localhost:8080';

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  failed: 1,
  timed_out: 2,
  terminated: 3,
  canceled: 4,
  continued: 5,
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

export const extractRunInput = ( trace: TraceData | null ): unknown => {
  if ( !trace?.children ) {
    return null;
  }
  const firstChild = trace.children[0] as DebugNode | undefined;
  if ( !firstChild ) {
    return null;
  }
  if ( firstChild.input !== undefined ) {
    return firstChild.input;
  }
  return firstChild.details?.input ?? null;
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

const HeaderRow: React.FC = () => (
  <Box>
    <Box width={COL.indicator}><Text> </Text></Box>
    <Box width={COL.icon}><Text> </Text></Box>
    <Box width={COL.status}><Text dimColor bold>STATUS</Text></Box>
    <Box width={COL.type}><Text dimColor bold>TYPE</Text></Box>
    <Box width={COL.id}><Text dimColor bold>ID</Text></Box>
    <Box width={COL.duration} justifyContent="flex-end"><Text dimColor bold>DURATION</Text></Box>
    <Box width={COL.started} marginLeft={2}><Text dimColor bold>STARTED</Text></Box>
  </Box>
);

const RunRow: React.FC<{ run: WorkflowRun; selected: boolean }> = ( { run, selected } ) => {
  const status = run.status ?? 'running';
  const color = statusColor( status );
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';

  return (
    <Box>
      <Box width={COL.indicator}>
        <SelectionIndicator selected={selected} />
      </Box>
      <Box width={COL.icon}><StatusIcon status={status} /></Box>
      <Box width={COL.status}><Text color={color}>{status}</Text></Box>
      <Box width={COL.type}><Text bold={selected}>{truncate( run.workflowType ?? '-', COL.type - 1 )}</Text></Box>
      <Box width={COL.id}><Text dimColor={!selected}>{truncate( run.workflowId ?? '-', COL.id - 1 )}</Text></Box>
      <Box width={COL.duration} justifyContent="flex-end"><Text dimColor={!selected}>{duration}</Text></Box>
      <Box width={COL.started} marginLeft={2}><Text dimColor={!selected}>{formatStartedShort( run.startedAt )}</Text></Box>
    </Box>
  );
};

const PaneTabs: React.FC<{ active: 'input' | 'output' }> = ( { active } ) => (
  <Box>
    {( [ 'input', 'output' ] as const ).map( ( tab, i ) => (
      <Box key={tab} marginRight={i === 0 ? 1 : 0}>
        {tab === active ? (
          <Text inverse bold>{` ${tab[0].toUpperCase()}${tab.slice( 1 )} `}</Text>
        ) : (
          <Text dimColor>{` ${tab[0].toUpperCase()}${tab.slice( 1 )} `}</Text>
        )}
      </Box>
    ) )}
  </Box>
);

interface RunPaneData {
  input: unknown;
  output: unknown;
  error: unknown;
  status: string;
  loading: boolean;
}

const InlineKV: React.FC<{ label: string; value: string }> = ( { label, value } ) => (
  <Box>
    <Text dimColor>{label}: </Text>
    <Text>{value}</Text>
  </Box>
);

const DetailPane: React.FC<{ run: WorkflowRun | undefined; pane: RunPaneData | null }> = ( { run, pane } ) => {
  const ui = useUiState();

  if ( !run || !pane ) {
    return (
      <Box>
        <Text dimColor>Select a run to see details.</Text>
      </Box>
    );
  }
  const { input: runInput, output: runOutput, error: runError, status, loading } = pane;
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';
  const activePane: 'input' | 'output' = ui.rightPaneTab === 'input' ? 'input' : 'output';

  const renderPane = (): React.ReactNode => {
    if ( activePane === 'input' ) {
      if ( loading && runInput === null ) {
        return <LoadingSpinner />;
      }
      return <JsonView value={runInput} maxLines={RUNS_PREVIEW_LINES} />;
    }
    if ( runError ) {
      return (
        <Box flexDirection="column">
          <Text color="red" bold>ERROR</Text>
          <Text color="red" wrap="wrap">{truncate( String( runError ), 400 )}</Text>
        </Box>
      );
    }
    if ( runOutput === undefined || runOutput === null ) {
      if ( loading ) {
        return <LoadingSpinner />;
      }
      return <Text dimColor>No output yet.</Text>;
    }
    return <JsonView value={runOutput} maxLines={RUNS_PREVIEW_LINES} />;
  };

  const heading = `${run.workflowType ?? 'run'} : ${run.runId ?? run.workflowId ?? '-'}`;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{heading}</Text>
      </Box>
      <Box marginTop={1}>
        <StatusIcon status={status} />
        <Text> </Text>
        <Text bold color={statusColor( status )}>{status.toUpperCase()}</Text>
        <Text dimColor>     </Text>
        <InlineKV label="DURATION" value={duration} />
        <Text dimColor>     </Text>
        <InlineKV label="STARTED" value={formatDate( run.startedAt )} />
        <Text dimColor>     </Text>
        <InlineKV label="COMPLETED" value={run.completedAt ? formatDate( run.completedAt ) : '—'} />
      </Box>
      <Box marginTop={1}>
        <PaneTabs active={activePane} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {renderPane()}
      </Box>
    </Box>
  );
};

const HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'enter', label: 'open' },
  { key: '←/→', label: 'switch pane' },
  { key: 'e', label: 'expand' },
  { key: 'o', label: 'temporal' },
  { key: '/', label: 'filter' },
  { key: 'tab', label: 'next tab' }
];

export const RunsPanel: React.FC<{ runs: WorkflowRun[] }> = ( { runs } ) => {
  const ui = useUiState();

  const filteredRuns = useMemo(
    () => buildVisibleRuns( runs, ui.search.query ),
    [ runs, ui.search.query ]
  );

  // Lazy initializer — runs once on mount. Restores the previously selected
  // run after the expanded-JSON modal unmounts and remounts the panel.
  const [ selectedIndex, setSelectedIndex ] = useState( () => {
    const previousRunId = ui.selection.runId;
    if ( !previousRunId ) {
      return 0;
    }
    const initial = buildVisibleRuns( runs, ui.search.query );
    const i = initial.findIndex( r => r.runId === previousRunId );
    return i >= 0 ? i : 0;
  } );

  const isActive = ui.tab === 'runs' && ui.runsView === 'list' && !ui.search.open && !ui.runModal.open && !ui.expandedJson.open;

  const clampedIndex = Math.min( selectedIndex, Math.max( 0, filteredRuns.length - 1 ) );
  const selectedRun = filteredRuns[clampedIndex];
  const { result, trace, loading } = useRunDetail( selectedRun?.workflowId, selectedRun?.runId, selectedRun?.status );

  const pane: RunPaneData | null = selectedRun ? {
    input: extractRunInput( trace ),
    output: result?.output,
    error: result?.error,
    status: result?.status ?? selectedRun.status ?? 'unknown',
    loading
  } : null;

  useEffect( () => {
    if ( clampedIndex !== selectedIndex ) {
      setSelectedIndex( clampedIndex );
    }
  }, [ clampedIndex, selectedIndex ] );

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
      setSelectedIndex( i => Math.max( 0, i - 1 ) );
      return;
    }
    if ( key.downArrow ) {
      setSelectedIndex( i => Math.min( filteredRuns.length - 1, i + 1 ) );
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
    if ( key.leftArrow || key.rightArrow ) {
      ui.setRightPaneTab( ui.rightPaneTab === 'input' ? 'output' : 'input' );
      return;
    }
    if ( input === 'e' && pane ) {
      const content = ui.rightPaneTab === 'input' ?
        pane.input :
        ( pane.error ?? pane.output );
      const label = `${selectedRun?.workflowType ?? 'run'} → ${ui.rightPaneTab}`;
      ui.openExpandedJson( content, label );
    }
  }, { isActive } );

  const detailRun = ui.runsView === 'detail' ?
    ( runs.find( r => r.runId === ui.selection.runId && r.workflowId === ui.selection.workflowId ) ?? selectedRun ) :
    undefined;

  useEffect( () => {
    if ( ui.runsView === 'detail' && !detailRun ) {
      ui.setRunsView( 'list' );
    }
  }, [ ui, detailRun ] );

  if ( ui.runsView === 'detail' && detailRun ) {
    return <RunDetailView run={detailRun} />;
  }

  if ( runs.length === 0 ) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Recent Runs</Text>
        <Box marginTop={1}>
          <Text dimColor>No runs yet. Trigger one from the Workflows tab or with `output workflow run …`.</Text>
        </Box>
        <Footer hints={[ { key: 'tab', label: 'next tab' }, { key: '?', label: 'help' } ]} />
      </Box>
    );
  }

  if ( filteredRuns.length === 0 ) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Recent Runs</Text>
        <Box marginTop={1}>
          <Text dimColor>No runs match `{ui.search.query}`. Press </Text>
          <Text bold>esc</Text>
          <Text dimColor> to clear the filter.</Text>
        </Box>
        <Footer hints={HINTS} itemCount={0} itemLabel="runs" />
      </Box>
    );
  }

  return (
    <MasterDetailPanel
      items={filteredRuns}
      selectedIndex={clampedIndex}
      visibleRows={RUNS_VISIBLE_ROWS}
      renderHeader={() => <HeaderRow />}
      renderRow={( run, selected ) => <RunRow run={run} selected={selected} />}
      rowKey={( run, i ) => `${run.workflowId}-${run.runId ?? run.startedAt}-${i}`}
      detail={<DetailPane run={selectedRun} pane={pane} />}
      hints={HINTS}
      itemLabel="runs"
    />
  );
};
