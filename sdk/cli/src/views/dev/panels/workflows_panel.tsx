import React, { useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Workflow } from '#api/generated/api.js';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { WorkflowStatusIcon, workflowStatusColor } from '#views/dev/components/workflow_status.js';
import { ContentTitle } from '#views/dev/components/content_title.js';
import { elapsedMs, formatDurationCompact } from '#utils/date_formatter.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import { formatStartedShort, useListSelection } from '#views/dev/utils/panel_helpers.js';
import {
  WORKFLOWS_VISIBLE_ROWS,
  WORKFLOWS_RECENT_RUNS_LIMIT
} from '#views/dev/utils/ui_constants.js';

const COL = {
  indicator: 3,
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

const sortByName = ( workflows: Workflow[] ): Workflow[] =>
  [ ...workflows ].sort( ( a, b ) => ( a.name ?? '' ).localeCompare( b.name ?? '' ) );

export const buildVisibleWorkflows = ( workflows: Workflow[], query: string ): Workflow[] => {
  const list = query ? workflows.filter( w => matchesQuery( w, query ) ) : workflows;
  return sortByName( list );
};

const HeaderRow: React.FC = () => (
  <Box>
    <Box width={COL.indicator}><Text> </Text></Box>
    <Box width={COL.name}><Text dimColor bold>WORKFLOW</Text></Box>
    <Box flexGrow={1}><Text dimColor bold>DESCRIPTION</Text></Box>
  </Box>
);

const WorkflowRow: React.FC<{ workflow: Workflow; selected: boolean }> = ( { workflow, selected } ) => (
  <Box>
    <Box width={COL.indicator}>
      <SelectionIndicator selected={selected} />
    </Box>
    <Box width={COL.name}><Text bold={selected} wrap="truncate-end">{workflow.name ?? '-'}</Text></Box>
    <Box flexGrow={1}>
      <Text dimColor={!selected} wrap="truncate-end">{workflow.description ?? 'No description'}</Text>
    </Box>
  </Box>
);

const SidebarRunRow: React.FC<{ run: WorkflowRun }> = ( { run } ) => {
  const status = run.status ?? 'unknown';
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';
  return (
    <Box>
      <WorkflowStatusIcon status={status} />
      <Box width={11} paddingLeft={1}><Text color={workflowStatusColor( status )}>{status}</Text></Box>
      <Box width={9} justifyContent="flex-end"><Text dimColor>{duration}</Text></Box>
      <Box width={14} justifyContent="flex-end"><Text dimColor>{formatStartedShort( run.startedAt )}</Text></Box>
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
  const recent = wfRuns.slice( 0, WORKFLOWS_RECENT_RUNS_LIMIT );

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box flexDirection="column" flexGrow={1}>
        <ContentTitle title={`Workflow "${workflow.name}"`} />
        <Box flexDirection="column" gap={1}>
          <Box>
            <Text dimColor>{stats.total} runs</Text>
            {stats.running > 0 && <><Text>&emsp;&emsp;</Text><Text color="blue">● {stats.running} running</Text></>}
            {stats.failed > 0 && <><Text>&emsp;&emsp;</Text><Text color="red">✗ {stats.failed} failed</Text></>}
            {stats.completed > 0 && <><Text>&emsp;&emsp;</Text><Text color="green">● {stats.completed} ok</Text></>}
          </Box>
          <Text wrap="wrap">{workflow.description ?? 'No description'}</Text>
        </Box>
      </Box>
      {recent.length > 0 ?
        <Box
          flexDirection="column"
          flexShrink={0}
          borderStyle="single"
          borderColor="blackBright"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          paddingY={1}
          paddingLeft={1}
          gap={1}>
          <Text dimColor bold>RECENT RUNS</Text>
          <Box flexDirection="column">
            {recent.map( ( run, i ) => <SidebarRunRow key={`${run.runId ?? i}`} run={run} /> )}
          </Box>
        </Box> :
        <></>}
    </Box>
  );
};

export const WORKFLOWS_HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'enter', label: 'show runs' },
  { key: 'r', label: 'run' }
];

export const WORKFLOWS_LOADING_HINTS = [];

export const WorkflowsPanel: React.FC<{
  workflows: Workflow[];
  runs: WorkflowRun[];
}> = ( { workflows, runs } ) => {
  const ui = useUiState();

  const filtered = useMemo(
    () => buildVisibleWorkflows( workflows, ui.search.query ),
    [ workflows, ui.search.query ]
  );
  const initialIndex = (): number => {
    const previousName = ui.selection.workflowName;
    if ( !previousName ) {
      return 0;
    }
    const initial = buildVisibleWorkflows( workflows, ui.search.query );
    const i = initial.findIndex( w => w.name === previousName );
    return i >= 0 ? i : 0;
  };

  const { selectedIndex: clamped, selectPrevious, selectNext } = useListSelection( filtered.length, initialIndex );
  const selectedWorkflow = filtered[clamped];

  const setSelection = ui.setSelection;
  useEffect( () => {
    setSelection( { workflowName: selectedWorkflow?.name } );
  }, [ selectedWorkflow?.name, setSelection ] );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      selectPrevious();
    } else if ( key.downArrow ) {
      selectNext();
    } else if ( key.return && selectedWorkflow?.name ) {
      ui.setSearchQuery( selectedWorkflow.name );
      ui.setTab( 'runs' );
    } else if ( input === 'r' && selectedWorkflow?.name ) {
      ui.openRunModal( selectedWorkflow.name, selectedWorkflow.path );
    }
  }, { isActive: ui.tab === 'workflows' && !ui.search.open } );

  if ( workflows.length === 0 ) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Loading catalog… (waiting for the API to come up)</Text>
      </Box>
    );
  }

  if ( filtered.length === 0 ) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No workflows match `{ui.search.query}`. Press <Text bold>esc</Text> to clear the filter.</Text>
      </Box>
    );
  }

  return (
    <MasterDetailPanel
      items={filtered}
      selectedIndex={clamped}
      visibleRows={WORKFLOWS_VISIBLE_ROWS}
      renderHeader={() => <HeaderRow />}
      renderRow={( wf, selected ) => <WorkflowRow workflow={wf} selected={selected} />}
      rowKey={( wf, i ) => wf.name ?? `row-${i}`}
      detail={<DetailPane workflow={selectedWorkflow} runs={runs} />}
    />
  );
};
