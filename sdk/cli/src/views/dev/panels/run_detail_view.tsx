import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { StatusIcon, statusColor } from '#components/status_icon.js';
import { formatDurationCompact, formatDate, elapsedMs } from '#utils/date_formatter.js';
import { Footer } from '#views/dev/chrome/footer.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState, type RightPaneTab } from '#views/dev/state/ui_state.js';
import { useRunDetail, type RunStep } from '#views/dev/hooks/use_run_detail.js';
import { JsonView } from '#views/dev/utils/json_render.js';
import { truncate, computeWindowStart } from '#views/dev/utils/panel_helpers.js';
import {
  RUN_DETAIL_VISIBLE_STEPS,
  RUN_DETAIL_PREVIEW_LINES
} from '#views/dev/utils/constants.js';

const RIGHT_PANE_ORDER: RightPaneTab[] = [ 'input', 'output', 'meta' ];

const cycleRightPane = ( current: RightPaneTab, direction: 1 | -1 ): RightPaneTab => {
  const idx = RIGHT_PANE_ORDER.indexOf( current );
  const next = ( idx + direction + RIGHT_PANE_ORDER.length ) % RIGHT_PANE_ORDER.length;
  return RIGHT_PANE_ORDER[next];
};

const COL = {
  num: 6,
  icon: 3,
  name: 50,
  duration: 8
};

const StepRow: React.FC<{ step: RunStep; selected: boolean }> = ( { step, selected } ) => (
  <Box>
    <Box width={COL.num}>
      <SelectionIndicator selected={selected} />
      <Text bold={selected}>{` ${step.index}`}</Text>
    </Box>
    <Box width={COL.icon}><StatusIcon status={step.status} /></Box>
    <Box width={COL.name}><Text bold={selected}>{truncate( step.name, COL.name - 1 )}</Text></Box>
    <Box width={COL.duration} justifyContent="flex-end">
      <Text dimColor={!selected}>{formatDurationCompact( step.durationMs )}</Text>
    </Box>
  </Box>
);

const SidebarKV: React.FC<{ label: string; value: string; color?: string }> = ( { label, value, color } ) => (
  <Box flexDirection="column" marginTop={1}>
    <Text dimColor bold>{label}</Text>
    <Text color={color} wrap="truncate-end">{value}</Text>
  </Box>
);

const Sidebar: React.FC<{ run: WorkflowRun; resultStatus: string | null }> = ( { run, resultStatus } ) => {
  const status = resultStatus ?? run.status ?? 'unknown';
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';
  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <StatusIcon status={status} />
        <Text> </Text>
        <Text bold color={statusColor( status )}>{status.toUpperCase()}</Text>
      </Box>
      <SidebarKV label="RUN ID" value={run.runId ?? '-'} />
      <SidebarKV label="WORKFLOW ID" value={run.workflowId ?? '-'} />
      <SidebarKV label="TYPE" value={run.workflowType ?? '-'} />
      <SidebarKV label="DURATION" value={duration} />
      <SidebarKV label="START" value={formatDate( run.startedAt )} />
      <SidebarKV label="END" value={run.completedAt ? formatDate( run.completedAt ) : '—'} />
    </Box>
  );
};

const PaneTabs: React.FC<{ active: RightPaneTab }> = ( { active } ) => (
  <Box marginTop={1}>
    {RIGHT_PANE_ORDER.map( ( tab, i ) => (
      <Box key={tab} marginRight={2}>
        {tab === active ? (
          <Text inverse bold>{` ${tab[0].toUpperCase()}${tab.slice( 1 )} `}</Text>
        ) : (
          <Text dimColor>{`${tab[0].toUpperCase()}${tab.slice( 1 )}${i < RIGHT_PANE_ORDER.length - 1 ? '' : ''}`}</Text>
        )}
      </Box>
    ) )}
  </Box>
);

const stepPaneValue = ( step: RunStep, activeTab: RightPaneTab ): unknown => {
  if ( activeTab === 'input' ) {
    return step.input;
  }
  if ( activeTab === 'output' ) {
    return step.error ?? step.output;
  }
  return {
    kind: step.kind,
    status: step.status,
    durationMs: step.durationMs,
    hasError: Boolean( step.error )
  };
};

const StepDetail: React.FC<{ step: RunStep | undefined; activeTab: RightPaneTab }> = ( { step, activeTab } ) => {
  if ( !step ) {
    return (
      <Box marginTop={1}>
        <Text dimColor>Select a step to see input/output.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <PaneTabs active={activeTab} />
      <Box marginTop={1} flexDirection="column">
        <JsonView value={stepPaneValue( step, activeTab )} maxLines={RUN_DETAIL_PREVIEW_LINES} />
      </Box>
    </Box>
  );
};

const HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: '←/→', label: 'switch pane' },
  { key: 'e', label: 'expand' },
  { key: 'esc', label: 'back' },
  { key: 'tab', label: 'next tab' }
];

export const RunDetailView: React.FC<{ run: WorkflowRun }> = ( { run } ) => {
  const ui = useUiState();
  const { result, steps, loading } = useRunDetail( run.workflowId, run.runId, run.status );
  const [ stepIndex, setStepIndex ] = useState( 0 );

  const isActive = ui.tab === 'runs' && ui.runsView === 'detail' && !ui.search.open && !ui.runModal.open && !ui.expandedJson.open;

  const clamped = Math.min( stepIndex, Math.max( 0, steps.length - 1 ) );
  const selectedStep: RunStep | undefined = steps[clamped];

  useEffect( () => {
    if ( clamped !== stepIndex ) {
      setStepIndex( clamped );
    }
  }, [ clamped, stepIndex ] );

  useInput( ( input, key ) => {
    if ( key.escape ) {
      ui.setRunsView( 'list' );
      return;
    }
    if ( key.upArrow ) {
      setStepIndex( i => Math.max( 0, i - 1 ) );
      return;
    }
    if ( key.downArrow ) {
      setStepIndex( i => Math.min( steps.length - 1, i + 1 ) );
      return;
    }
    if ( key.leftArrow ) {
      ui.setRightPaneTab( cycleRightPane( ui.rightPaneTab, -1 ) );
      return;
    }
    if ( key.rightArrow ) {
      ui.setRightPaneTab( cycleRightPane( ui.rightPaneTab, 1 ) );
      return;
    }
    if ( input === 'e' && selectedStep ) {
      const content = stepPaneValue( selectedStep, ui.rightPaneTab );
      const label = `step ${selectedStep.index}: ${selectedStep.name} → ${ui.rightPaneTab}`;
      ui.openExpandedJson( content, label );
    }
  }, { isActive } );

  const windowStart = computeWindowStart( clamped, steps.length, RUN_DETAIL_VISIBLE_STEPS );

  const visibleSteps = steps.slice( windowStart, windowStart + RUN_DETAIL_VISIBLE_STEPS );

  const renderStepList = (): React.ReactNode => {
    if ( loading && steps.length === 0 ) {
      return (
        <Box marginTop={1}>
          <LoadingSpinner label="Loading steps…" />
        </Box>
      );
    }
    if ( steps.length === 0 ) {
      return (
        <Box marginTop={1}>
          <Text dimColor>No steps recorded for this run.</Text>
        </Box>
      );
    }
    return (
      <>
        {windowStart > 0 && <Text dimColor>  ↑ {windowStart} more above</Text>}
        {visibleSteps.map( ( step, i ) => (
          <StepRow key={`${step.index}-${i}`} step={step} selected={windowStart + i === clamped} />
        ) )}
        {windowStart + RUN_DETAIL_VISIBLE_STEPS < steps.length && (
          <Text dimColor>  ↓ {steps.length - windowStart - RUN_DETAIL_VISIBLE_STEPS} more below</Text>
        )}
      </>
    );
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text dimColor>Recent Runs › </Text>
        <Text bold>{run.workflowType}</Text>
        <Text dimColor> › </Text>
        <Text>{truncate( run.runId ?? '-', 28 )}</Text>
      </Box>

      <Box flexDirection="row" marginTop={1}>
        <Box flexDirection="column" flexGrow={1}>
          {renderStepList()}
        </Box>
        <Box
          flexDirection="column"
          width={40}
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          paddingLeft={1}
        >
          <Sidebar run={run} resultStatus={result?.status ?? null} />
        </Box>
      </Box>

      <StepDetail step={selectedStep} activeTab={ui.rightPaneTab} />

      <Footer hints={HINTS} itemCount={steps.length} itemLabel="steps" />
    </Box>
  );
};
