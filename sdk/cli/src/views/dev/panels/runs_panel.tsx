import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { format, parseISO } from 'date-fns';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { StatusIcon, statusColor } from '#components/status_icon.js';
import { elapsedMs, formatDurationCompact, formatDate } from '#utils/date_formatter.js';
import { openUrl } from '#utils/open_url.js';
import Spinner from 'ink-spinner';
import { Footer } from '#views/dev/chrome/footer.js';
import { HorizontalRule } from '#views/dev/chrome/divider.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { RunDetailView } from '#views/dev/panels/run_detail_view.js';
import { useRunDetail } from '#views/dev/hooks/use_run_detail.js';
import { JsonView } from '#views/dev/utils/json_render.js';
import type { TraceData, DebugNode } from '#types/trace.js';

const TEMPORAL_UI_BASE = 'http://localhost:8080';
const VISIBLE_ROWS = 8;

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

const truncate = ( str: string, max: number ): string =>
  str.length > max ? `${str.slice( 0, max - 1 )}…` : str;

const COL = {
  indicator: 2,
  icon: 3,
  status: 11,
  type: 22,
  id: 26,
  duration: 9,
  started: 14
};

const formatStartedShort = ( iso: string | undefined ): string => {
  if ( !iso ) {
    return '-';
  }
  try {
    return format( parseISO( iso ), 'MMM d HH:mm' );
  } catch {
    return '-';
  }
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
    <Box backgroundColor={selected ? 'magenta' : undefined}>
      <Box width={COL.indicator}>
        <Text bold={selected}>{selected ? '▸' : ' '}</Text>
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

const PREVIEW_LINES = 12;

const extractRunInput = ( trace: TraceData | null ): unknown => {
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

const PaneTabs: React.FC<{ active: 'input' | 'output' }> = ( { active } ) => (
  <Box>
    {( [ 'input', 'output' ] as const ).map( ( tab, i ) => (
      <Box key={tab} marginRight={i === 0 ? 1 : 0}>
        {tab === active ? (
          <Text backgroundColor="magenta" color="white" bold>{` ${tab[0].toUpperCase()}${tab.slice( 1 )} `}</Text>
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
        return (
          <Box><Text color="yellow"><Spinner type="dots" /></Text><Text dimColor> loading…</Text></Box>
        );
      }
      return <JsonView value={runInput} maxLines={PREVIEW_LINES} />;
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
        return (
          <Box><Text color="yellow"><Spinner type="dots" /></Text><Text dimColor> loading…</Text></Box>
        );
      }
      return <Text dimColor>No output yet.</Text>;
    }
    return <JsonView value={runOutput} maxLines={PREVIEW_LINES} />;
  };

  const heading = `${run.workflowType ?? 'run'} : ${run.runId ?? run.workflowId ?? '-'}`;

  return (
    <Box flexDirection="column">
      <Box>
        <Text backgroundColor="magenta" color="white" bold>{` ${heading} `}</Text>
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
  const [ selectedIndex, setSelectedIndex ] = useState( 0 );

  const filteredRuns = useMemo( () => {
    const filtered = ui.search.query ? runs.filter( r => matchesFilter( r, ui.search.query ) ) : runs;
    return sortRuns( filtered );
  }, [ runs, ui.search.query ] );

  const isActive = ui.tab === 'runs' && ui.runsView === 'list' && !ui.search.open && !ui.runModal.open && !ui.expandedJson.open;

  const clampedIndex = Math.min( selectedIndex, Math.max( 0, filteredRuns.length - 1 ) );
  const selectedRun = filteredRuns[clampedIndex];
  const { result, trace, loading } = useRunDetail( selectedRun?.workflowId, selectedRun?.runId );

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
        <Text bold>📋 Recent Runs</Text>
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
        <Text bold>📋 Recent Runs</Text>
        <Box marginTop={1}>
          <Text dimColor>No runs match `{ui.search.query}`. Press </Text>
          <Text bold>esc</Text>
          <Text dimColor> to clear the filter.</Text>
        </Box>
        <Footer hints={HINTS} itemCount={0} itemLabel="runs" />
      </Box>
    );
  }

  const windowStart = ( () => {
    const half = Math.floor( VISIBLE_ROWS / 2 );
    const start = Math.max( 0, clampedIndex - half );
    const maxStart = Math.max( 0, filteredRuns.length - VISIBLE_ROWS );
    return Math.min( start, maxStart );
  } )();

  const visibleRuns = filteredRuns.slice( windowStart, windowStart + VISIBLE_ROWS );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column">
        <HeaderRow />
        {windowStart > 0 && <Text dimColor>  ↑ {windowStart} more above</Text>}
        {visibleRuns.map( ( run, i ) => (
          <RunRow
            key={`${run.workflowId}-${run.runId ?? run.startedAt}-${windowStart + i}`}
            run={run}
            selected={windowStart + i === clampedIndex}
          />
        ) )}
        {windowStart + VISIBLE_ROWS < filteredRuns.length && (
          <Text dimColor>  ↓ {filteredRuns.length - windowStart - VISIBLE_ROWS} more below</Text>
        )}
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <HorizontalRule color="gray" />
      </Box>
      <DetailPane run={selectedRun} pane={pane} />
      <Footer hints={HINTS} itemCount={filteredRuns.length} itemLabel="runs" />
    </Box>
  );
};
