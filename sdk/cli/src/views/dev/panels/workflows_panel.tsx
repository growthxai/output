import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Workflow } from '#api/generated/api.js';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { StatusIcon, statusColor } from '#components/status_icon.js';
import { elapsedMs, formatDurationCompact } from '#utils/date_formatter.js';
import { format, parseISO } from 'date-fns';
import { Footer } from '#views/dev/chrome/footer.js';
import { HorizontalRule } from '#views/dev/chrome/divider.js';
import { useUiState } from '#views/dev/state/ui_state.js';

const VISIBLE_ROWS = 8;
const RECENT_RUNS_LIMIT = 5;

const COL = {
  indicator: 2,
  name: 30
};

const matchesQuery = ( workflow: Workflow, query: string ): boolean => {
  if ( !query ) {
    return true;
  }
  const q = query.toLowerCase();
  if ( ( workflow.name ?? '' ).toLowerCase().includes( q ) ) {
    return true;
  }
  if ( ( workflow.description ?? '' ).toLowerCase().includes( q ) ) {
    return true;
  }
  return ( workflow.aliases ?? [] ).some( a => a.toLowerCase().includes( q ) );
};

const HeaderRow: React.FC = () => (
  <Box>
    <Box width={COL.indicator}><Text> </Text></Box>
    <Box width={COL.name}><Text dimColor bold>WORKFLOW</Text></Box>
    <Box flexGrow={1}><Text dimColor bold>DESCRIPTION</Text></Box>
  </Box>
);

const WorkflowRow: React.FC<{ workflow: Workflow; selected: boolean }> = ( { workflow, selected } ) => (
  <Box backgroundColor={selected ? 'magenta' : undefined}>
    <Box width={COL.indicator}>
      <Text bold={selected}>{selected ? '▸' : ' '}</Text>
    </Box>
    <Box width={COL.name}><Text bold={selected} wrap="truncate-end">{workflow.name ?? '-'}</Text></Box>
    <Box flexGrow={1}>
      <Text dimColor={!selected} wrap="truncate-end">{workflow.description ?? 'No description'}</Text>
    </Box>
  </Box>
);

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

const SidebarRunRow: React.FC<{ run: WorkflowRun }> = ( { run } ) => {
  const status = run.status ?? 'unknown';
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';
  return (
    <Box>
      <StatusIcon status={status} />
      <Text> </Text>
      <Box width={10}><Text color={statusColor( status )}>{status}</Text></Box>
      <Box width={9} justifyContent="flex-end"><Text dimColor>{duration}</Text></Box>
      <Box marginLeft={2}><Text dimColor>{formatStartedShort( run.startedAt )}</Text></Box>
    </Box>
  );
};

const DetailPane: React.FC<{ workflow: Workflow | undefined; runs: WorkflowRun[] }> = ( { workflow, runs } ) => {
  if ( !workflow ) {
    return (
      <Box>
        <Text dimColor>Select a workflow to see details.</Text>
      </Box>
    );
  }
  const wfRuns = runs.filter( r => r.workflowType === workflow.name );
  const stats = {
    total: wfRuns.length,
    running: wfRuns.filter( r => r.status === 'running' ).length,
    failed: wfRuns.filter( r => r.status === 'failed' ).length,
    completed: wfRuns.filter( r => r.status === 'completed' ).length
  };
  const recent = wfRuns.slice( 0, RECENT_RUNS_LIMIT );

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="white">{workflow.name}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{stats.total} runs</Text>
        {stats.running > 0 && <><Text dimColor>   </Text><Text color="blue">● {stats.running} running</Text></>}
        {stats.failed > 0 && <><Text dimColor>   </Text><Text color="red">✗ {stats.failed} failed</Text></>}
        {stats.completed > 0 && <><Text dimColor>   </Text><Text color="green">● {stats.completed} ok</Text></>}
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" flexGrow={1} paddingRight={2}>
          <Text wrap="wrap">{workflow.description ?? 'No description'}</Text>
        </Box>
        <Box
          flexDirection="column"
          width={42}
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          paddingLeft={2}
        >
          <Text dimColor bold>RECENT RUNS</Text>
          <Box flexDirection="column" marginTop={1}>
            {recent.length === 0 ? (
              <Text dimColor>No runs yet</Text>
            ) : (
              recent.map( ( run, i ) => <SidebarRunRow key={`${run.runId ?? i}`} run={run} /> )
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'enter', label: 'show runs' },
  { key: 'r', label: 'run' },
  { key: '/', label: 'search' },
  { key: 'tab', label: 'next tab' }
];

const sortByName = ( workflows: Workflow[] ): Workflow[] =>
  [ ...workflows ].sort( ( a, b ) => ( a.name ?? '' ).localeCompare( b.name ?? '' ) );

export const WorkflowsPanel: React.FC<{
  workflows: Workflow[];
  runs: WorkflowRun[];
}> = ( { workflows, runs } ) => {
  const ui = useUiState();
  const [ selectedIndex, setSelectedIndex ] = useState( 0 );

  const filtered = useMemo( () => {
    const list = ui.search.query ? workflows.filter( w => matchesQuery( w, ui.search.query ) ) : workflows;
    return sortByName( list );
  }, [ workflows, ui.search.query ] );

  const isActive = ui.tab === 'workflows' && !ui.search.open && !ui.runModal.open;

  const clamped = Math.min( selectedIndex, Math.max( 0, filtered.length - 1 ) );
  const selectedWorkflow = filtered[clamped];

  useEffect( () => {
    if ( clamped !== selectedIndex ) {
      setSelectedIndex( clamped );
    }
  }, [ clamped, selectedIndex ] );

  const setSelection = ui.setSelection;
  useEffect( () => {
    setSelection( { workflowName: selectedWorkflow?.name } );
  }, [ selectedWorkflow?.name, setSelection ] );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      setSelectedIndex( i => Math.max( 0, i - 1 ) );
    } else if ( key.downArrow ) {
      setSelectedIndex( i => Math.min( filtered.length - 1, i + 1 ) );
    } else if ( key.return && selectedWorkflow?.name ) {
      ui.setSearchQuery( selectedWorkflow.name );
      ui.setTab( 'runs' );
    } else if ( input === 'r' && selectedWorkflow?.name ) {
      ui.openRunModal( selectedWorkflow.name );
    }
  }, { isActive } );

  if ( workflows.length === 0 ) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>📂 Workflows</Text>
        <Box marginTop={1}>
          <Text dimColor>Loading catalog… (waiting for the API to come up)</Text>
        </Box>
        <Footer hints={[ { key: 'tab', label: 'next tab' }, { key: '?', label: 'help' } ]} />
      </Box>
    );
  }

  if ( filtered.length === 0 ) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>📂 Workflows</Text>
        <Box marginTop={1}>
          <Text dimColor>No workflows match `{ui.search.query}`. Press </Text>
          <Text bold>esc</Text>
          <Text dimColor> to clear.</Text>
        </Box>
        <Footer hints={HINTS} itemCount={0} itemLabel="workflows" />
      </Box>
    );
  }

  const windowStart = ( () => {
    const half = Math.floor( VISIBLE_ROWS / 2 );
    const start = Math.max( 0, clamped - half );
    const maxStart = Math.max( 0, filtered.length - VISIBLE_ROWS );
    return Math.min( start, maxStart );
  } )();

  const visible = filtered.slice( windowStart, windowStart + VISIBLE_ROWS );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column">
        <HeaderRow />
        {windowStart > 0 && <Text dimColor>  ↑ {windowStart} more above</Text>}
        {visible.map( ( wf, i ) => (
          <WorkflowRow key={wf.name ?? i} workflow={wf} selected={windowStart + i === clamped} />
        ) )}
        {windowStart + VISIBLE_ROWS < filtered.length && (
          <Text dimColor>  ↓ {filtered.length - windowStart - VISIBLE_ROWS} more below</Text>
        )}
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <HorizontalRule color="gray" />
      </Box>
      <DetailPane workflow={selectedWorkflow} runs={runs} />
      <Footer hints={HINTS} itemCount={filtered.length} itemLabel="workflows" />
    </Box>
  );
};
