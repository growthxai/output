import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { WorkflowStatusIcon } from '#views/dev/components/workflow_status.js';
import { formatDurationCompact } from '#utils/date_formatter.js';
import { TabBar, getHeight as getTabBarHeight, type TabBarItem } from '#views/dev/chrome/tab_bar.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState, type RunStepPaneTab } from '#views/dev/state/ui_state.js';
import { useRunDetail, type RunStep } from '#views/dev/hooks/use_run_detail.js';
import { JsonView } from '#views/dev/utils/json_render.js';
import { cycleValue, formatContentTitle, truncate, useListSelection } from '#views/dev/utils/panel_helpers.js';
import {
  RUN_DETAIL_VISIBLE_STEPS
} from '#views/dev/utils/ui_constants.js';
import { ContentTitle, getHeight as getContentTitleHeight } from '#views/dev/components/content_title.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import { ModalFrame, getHeight as getModalFrameHeight } from '#views/dev/modals/modal_frame.js';

const RIGHT_PANE_ORDER: RunStepPaneTab[] = [ 'input', 'output', 'meta' ];
const RIGHT_PANE_TABS: TabBarItem[] = [
  { id: 'input', label: 'Input' },
  { id: 'output', label: 'Output' },
  { id: 'meta', label: 'Meta' }
];

const STEPS_MODAL_SHORTCUTS = [
  [ '↑/↓', 'navigate' ],
  [ '←/→', 'switch pane' ],
  [ 'e', 'expand' ],
  [ 'esc', 'back' ]
] as const;

const COL = {
  indicator: 3,
  icon: 3,
  num: 3,
  name: 50,
  duration: 8
};

const HeaderRow: React.FC = () => (
  <Box>
    <Box width={COL.indicator}><Text>&nbsp;</Text></Box>
    <Box width={COL.icon}><Text>&nbsp;</Text></Box>
    <Box width={COL.num}><Text dimColor bold>#</Text></Box>
    <Box width={COL.name}><Text dimColor bold>NAME</Text></Box>
    <Box width={COL.duration} justifyContent="flex-end"><Text dimColor bold>DURATION</Text></Box>
  </Box>
);

const StepRow: React.FC<{ step: RunStep; selected: boolean }> = ( { step, selected } ) => (
  <Box>
    <Box width={COL.indicator}><SelectionIndicator selected={selected} /></Box>
    <Box width={COL.icon}><WorkflowStatusIcon status={step.status} /></Box>
    <Box width={COL.num}><Text bold={selected}>{step.index}</Text></Box>
    <Box width={COL.name}><Text bold={selected}>{truncate( step.name, COL.name - 1 )}</Text></Box>
    <Box width={COL.duration} justifyContent="flex-end">
      <Text dimColor={!selected}>{formatDurationCompact( step.durationMs )}</Text>
    </Box>
  </Box>
);

const stepPaneValue = ( step: RunStep, activeTab: RunStepPaneTab ): unknown => {
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

const StepDetail: React.FC<{
  step: RunStep | undefined;
  activeTab: RunStepPaneTab;
  rows: number;
}> = ( { step, activeTab, rows } ) => {
  if ( !step ) {
    return (
      <Box>
        <Text dimColor>Select a step to see input/output.</Text>
      </Box>
    );
  }

  const tabContentRows = Math.max( 1, rows - getContentTitleHeight() - getTabBarHeight() );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <ContentTitle title={formatContentTitle( [ `Step "${step.name}"`, 'Result' ] )} />
      <TabBar active={activeTab} items={RIGHT_PANE_TABS} />
      <Box flexDirection="column">
        <JsonView value={stepPaneValue( step, activeTab )} maxLines={tabContentRows} />
      </Box>
    </Box>
  );
};

export const StepsModal: React.FC<{ run: WorkflowRun; height: number }> = ( { run, height } ) => {
  const ui = useUiState();
  const { steps, loading } = useRunDetail( run.workflowId, run.runId, run.status );

  const { selectedIndex: clamped, selectPrevious, selectNext } = useListSelection( steps.length );
  const selectedStep: RunStep | undefined = steps[clamped];
  const activeTab = ui.runStepPaneTab;

  useInput( ( input, key ) => {
    if ( key.escape ) {
      ui.setRunsView( 'list' );
      return;
    }
    if ( key.upArrow ) {
      selectPrevious();
      return;
    }
    if ( key.downArrow ) {
      selectNext();
      return;
    }
    if ( key.leftArrow ) {
      ui.setRunStepPaneTab( cycleValue( RIGHT_PANE_ORDER, activeTab, -1 ) );
      return;
    }
    if ( key.rightArrow ) {
      ui.setRunStepPaneTab( cycleValue( RIGHT_PANE_ORDER, activeTab, 1 ) );
      return;
    }
    if ( input === 'e' && selectedStep ) {
      const content = stepPaneValue( selectedStep, activeTab );
      const label = `step ${selectedStep.index}: ${selectedStep.name} -> ${activeTab}`;
      ui.openExpandedJson( content, label );
    }
  }, { isActive: ui.tab === 'runs' && ui.runsView === 'detail' && !ui.expandedJson.open } );

  const contentRows = Math.max( 1, height - getModalFrameHeight() );

  const renderDetail = ( rows: number ): React.ReactNode => {
    if ( loading && steps.length === 0 ) {
      return (
        <LoadingSpinner label="Loading steps..." />
      );
    }
    if ( steps.length === 0 ) {
      return (
        <Text dimColor>No steps recorded for this run.</Text>
      );
    }
    return <StepDetail step={selectedStep} activeTab={activeTab} rows={rows} />;
  };

  return (
    <ModalFrame
      title={formatContentTitle( [ `Workflow "${run.workflowType}"`, 'Steps' ] )}
      shortcuts={STEPS_MODAL_SHORTCUTS}
    >
      <MasterDetailPanel
        items={steps}
        selectedIndex={clamped}
        height={contentRows}
        visibleRows={RUN_DETAIL_VISIBLE_STEPS}
        renderHeader={() => <HeaderRow />}
        renderRow={( step, selected ) => <StepRow step={step} selected={selected} />}
        rowKey={( step, i ) => `${step.index}-${step.name}-${i}`}
        detail={( { detailRows } ) => renderDetail( detailRows )}
      />
    </ModalFrame>
  );
};
