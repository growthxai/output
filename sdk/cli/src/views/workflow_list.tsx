import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getWorkflowIdResult, type GetWorkflowIdResult200 } from '#api/generated/api.js';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { openUrl } from '#utils/open_url.js';

const TEMPORAL_UI_BASE = 'http://localhost:8080';
const VISIBLE_ROWS = 15;

const STATUS_COLORS: Record<string, string> = {
  running: 'yellow',
  completed: 'green',
  failed: 'red',
  canceled: 'gray',
  terminated: 'red',
  timed_out: 'red',
  continued: 'blue'
};

const STATUS_ICONS: Record<string, string> = {
  running: '◐',
  completed: '●',
  failed: '✗',
  canceled: '○',
  terminated: '✗',
  timed_out: '✗',
  continued: '↻'
};

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
    const statusDiff = ( STATUS_ORDER[a.status ?? ''] ?? 99 ) - ( STATUS_ORDER[b.status ?? ''] ?? 99 );
    if ( statusDiff !== 0 ) {
      return statusDiff;
    }
    const aTime = a.startedAt ? new Date( a.startedAt ).getTime() : 0;
    const bTime = b.startedAt ? new Date( b.startedAt ).getTime() : 0;
    return bTime - aTime;
  } );

const formatDuration = ( startedAt?: string, completedAt?: string | null ): string => {
  if ( !startedAt ) {
    return '-';
  }
  const start = new Date( startedAt ).getTime();
  const end = completedAt ? new Date( completedAt ).getTime() : Date.now();
  const ms = end - start;

  if ( ms < 1000 ) {
    return `${ms}ms`;
  }
  if ( ms < 60_000 ) {
    return `${( ms / 1000 ).toFixed( 1 )}s`;
  }
  return `${( ms / 60_000 ).toFixed( 1 )}m`;
};

const truncate = ( str: string, max: number ): string =>
  str.length > max ? str.slice( 0, max - 1 ) + '…' : str;

const formatJson = ( value: unknown, maxLength = 200 ): string => {
  if ( value === undefined || value === null ) {
    return '-';
  }
  try {
    const str = JSON.stringify( value, null, 2 );
    return str.length > maxLength ? str.slice( 0, maxLength ) + '…' : str;
  } catch {
    return String( value );
  }
};

// Column config: label, width, alignment
const COL = {
  indicator: 2,
  icon: 3,
  status: 12,
  type: 20,
  id: 32,
  duration: 10
};

const WorkflowRow: React.FC<{
  run: WorkflowRun;
  selected: boolean;
}> = ( { run, selected } ) => {
  const status = run.status ?? 'running';
  const color = STATUS_COLORS[status] ?? 'white';
  const icon = STATUS_ICONS[status] ?? '?';

  return (
    <Box>
      <Box width={COL.indicator}>
        <Text color={selected ? 'cyan' : undefined} bold={selected}>
          {selected ? '▸' : ' '}
        </Text>
      </Box>
      <Box width={COL.icon}><Text color={color}>{icon}</Text></Box>
      <Box width={COL.status}><Text color={color}>{status}</Text></Box>
      <Box width={COL.type}><Text bold={selected}>{truncate( run.workflowType ?? '-', COL.type - 2 )}</Text></Box>
      <Box width={COL.id}><Text dimColor={!selected}>{truncate( run.workflowId ?? '-', COL.id - 2 )}</Text></Box>
      <Box width={COL.duration} justifyContent="flex-end"><Text dimColor>{formatDuration( run.startedAt, run.completedAt )}</Text></Box>
    </Box>
  );
};

const HeaderRow: React.FC = () => (
  <Box>
    <Box width={COL.indicator}><Text> </Text></Box>
    <Box width={COL.icon}><Text> </Text></Box>
    <Box width={COL.status}><Text dimColor bold>STATUS</Text></Box>
    <Box width={COL.type}><Text dimColor bold>TYPE</Text></Box>
    <Box width={COL.id}><Text dimColor bold>WORKFLOW ID</Text></Box>
    <Box width={COL.duration} justifyContent="flex-end"><Text dimColor bold>DURATION</Text></Box>
  </Box>
);

const WorkflowDetailPane: React.FC<{
  detail: GetWorkflowIdResult200;
  loading: boolean;
}> = ( { detail, loading } ) => {
  if ( loading ) {
    return (
      <Box marginTop={1}>
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text> Loading details...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2}>
      <Box>
        <Text bold>Status: </Text>
        <Text color={STATUS_COLORS[detail.status ?? ''] ?? 'white'}>{detail.status}</Text>
      </Box>
      {detail.error && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="red">Error:</Text>
          <Text color="red">{truncate( detail.error, 300 )}</Text>
        </Box>
      )}
      {detail.output !== undefined && detail.output !== null && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Output:</Text>
          <Text>{formatJson( detail.output, 400 )}</Text>
        </Box>
      )}
    </Box>
  );
};

const Toolbar: React.FC<{ hints: Array<{ key: string; label: string }> }> = ( { hints } ) => (
  <Box marginTop={1}>
    {hints.map( ( hint, i ) => (
      <React.Fragment key={hint.key}>
        {i > 0 && <Text dimColor>{' | '}</Text>}
        <Text dimColor>{'('}</Text>
        <Text dimColor bold>{hint.key}</Text>
        <Text dimColor>{')'}</Text>
        <Text dimColor>{` ${hint.label}`}</Text>
      </React.Fragment>
    ) )}
  </Box>
);

export const WorkflowListView: React.FC<{
  runs: WorkflowRun[];
  onBack: () => void;
}> = ( { runs, onBack } ) => {
  const [ selectedIndex, setSelectedIndex ] = useState( 0 );
  const [ detail, setDetail ] = useState<GetWorkflowIdResult200 | null>( null );
  const [ detailLoading, setDetailLoading ] = useState( false );
  const cacheRef = useRef( new Map<string, GetWorkflowIdResult200>() );
  const fetchIdRef = useRef( 0 );

  const sortedRuns = useMemo( () => sortRuns( runs ), [ runs ] );

  const clampedIndex = Math.min( selectedIndex, Math.max( 0, sortedRuns.length - 1 ) );
  const selectedRun = sortedRuns[clampedIndex];
  const selectedWorkflowId = selectedRun?.workflowId;

  // Reset selection when runs change drastically
  useEffect( () => {
    if ( clampedIndex !== selectedIndex ) {
      setSelectedIndex( clampedIndex );
    }
  }, [ clampedIndex, selectedIndex ] );

  // Fetch detail for selected workflow
  useEffect( () => {
    if ( !selectedWorkflowId ) {
      setDetail( null );
      return;
    }

    const cached = cacheRef.current.get( selectedWorkflowId );
    if ( cached ) {
      setDetail( cached );
      setDetailLoading( false );
      return;
    }

    const currentFetchId = ++fetchIdRef.current;
    setDetailLoading( true );

    getWorkflowIdResult( selectedWorkflowId )
      .then( response => {
        if ( fetchIdRef.current !== currentFetchId ) {
          return;
        }
        const data = response.data as GetWorkflowIdResult200;
        cacheRef.current.set( selectedWorkflowId, data );
        setDetail( data );
        setDetailLoading( false );
      } )
      .catch( () => {
        if ( fetchIdRef.current !== currentFetchId ) {
          return;
        }
        setDetail( null );
        setDetailLoading( false );
      } );
  }, [ selectedWorkflowId ] );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      setSelectedIndex( i => Math.max( 0, i - 1 ) );
    } else if ( key.downArrow ) {
      setSelectedIndex( i => Math.min( sortedRuns.length - 1, i + 1 ) );
    } else if ( key.escape || input === 'q' ) {
      onBack();
    } else if ( input === 'o' && selectedWorkflowId ) {
      openUrl( `${TEMPORAL_UI_BASE}/namespaces/default/workflows/${selectedWorkflowId}` );
    }
  } );

  // Compute visible window
  const windowStart = useMemo( () => {
    const half = Math.floor( VISIBLE_ROWS / 2 );
    const start = Math.max( 0, clampedIndex - half );
    const maxStart = Math.max( 0, sortedRuns.length - VISIBLE_ROWS );
    return Math.min( start, maxStart );
  }, [ clampedIndex, sortedRuns.length ] );

  const visibleRuns = sortedRuns.slice( windowStart, windowStart + VISIBLE_ROWS );

  if ( sortedRuns.length === 0 ) {
    return (
      <Box flexDirection="column">
        <Text bold>Workflow Runs</Text>
        <Box marginTop={1}><Text dimColor>No workflow runs found.</Text></Box>
        <Toolbar hints={[ { key: 'q', label: 'back' } ]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Workflow Runs ({sortedRuns.length})</Text>

      <Box flexDirection="column" marginTop={1}>
        <HeaderRow />
        {windowStart > 0 && <Text dimColor>  ↑ {windowStart} more above</Text>}
        {visibleRuns.map( ( run, i ) => (
          <WorkflowRow
            key={`${run.workflowId}-${run.startedAt}-${windowStart + i}`}
            run={run}
            selected={windowStart + i === clampedIndex}
          />
        ) )}
        {windowStart + VISIBLE_ROWS < sortedRuns.length && (
          <Text dimColor>  ↓ {sortedRuns.length - windowStart - VISIBLE_ROWS} more below</Text>
        )}
      </Box>

      {detail && <WorkflowDetailPane detail={detail} loading={detailLoading} />}
      {detailLoading && !detail && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Loading details...</Text>
        </Box>
      )}

      <Toolbar hints={[
        { key: '↑/↓', label: 'navigate' },
        { key: 'o', label: 'open in temporal' },
        { key: 'q', label: 'back' }
      ]} />
    </Box>
  );
};
