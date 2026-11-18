import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import type { Span, SpanStatus } from '#services/workflow_history/correlator.js';
import { computeBar, buildRulerLine, formatDurationLabel, FULL_BLOCK, THIN_BLOCK } from '#utils/waterfall.js';
import { useStepGraph } from '#views/dev/hooks/use_step_graph.js';
import { isTerminalRunStatus } from '#views/dev/hooks/use_run_detail.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { ModalFrame, getHeight as getModalFrameHeight } from '#views/dev/modals/modal_frame.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import { ContentTitle, getHeight as getContentTitleHeight } from '#views/dev/components/content_title.js';
import { TabBar, getHeight as getTabBarHeight, type TabBarItem } from '#views/dev/chrome/tab_bar.js';
import { JsonView } from '#views/dev/utils/json_render.js';
import { workflowStatusColor } from '#views/dev/components/workflow_status.js';
import { useUiState, type RunStepPaneTab } from '#views/dev/state/ui_state.js';
import { capitalize, cycleValue, formatContentTitle, formatStartedShort, truncate, useListSelection } from '#views/dev/utils/panel_helpers.js';

const FRAME_WIDTH_OVERHEAD = 6; // outer paddingX (2) + round border (2) + inner paddingX (2)
const META_ROWS = 2; // run status/started line + its bottom margin
const FALLBACK_COLS = 100;
const MIN_WIDTH = 40;
const MIN_TRACK = 10;
const VISIBLE_ROWS = 10;
const TICK_MS = 1_000;

const COL = { sel: 3, label: 22, duration: 8 };

const PANE_ORDER: RunStepPaneTab[] = [ 'input', 'output', 'meta' ];
const PANE_TABS: TabBarItem[] = [
  { id: 'input', label: 'Input' },
  { id: 'output', label: 'Output' },
  { id: 'meta', label: 'Meta' }
];

const STEP_GRAPH_SHORTCUTS = [
  [ '↑/↓', 'navigate' ],
  [ '←/→', 'tab' ],
  [ 'e', 'expand' ],
  [ 'esc', 'close' ]
] as const;

const parseMs = ( iso: string | null | undefined ): number | null => {
  if ( !iso ) {
    return null;
  }
  const ms = Date.parse( iso );
  return Number.isNaN( ms ) ? null : ms;
};

const spanColor = ( status: SpanStatus ): string => ( status === 'pending' ? 'gray' : workflowStatusColor( status ) );

// Stretch a still-running step's bar to the live edge so it visibly grows.
const toLiveSpans = ( spans: Span[], totalMs: number, terminal: boolean ): Span[] => {
  if ( terminal ) {
    return spans;
  }
  return spans.map( span => ( span.status === 'running' ?
    { ...span, endOffsetMs: Math.max( span.endOffsetMs, totalMs ), durationMs: Math.max( 0, totalMs - span.startOffsetMs ) } :
    span ) );
};

const spanPaneValue = ( span: Span, tab: RunStepPaneTab ): unknown => {
  if ( tab === 'input' ) {
    return span.input;
  }
  if ( tab === 'output' ) {
    return span.failureMessage ?? span.output;
  }
  return {
    status: span.status,
    started: span.startedAt,
    ended: span.completedAt,
    duration: formatDurationLabel( Math.max( 0, span.durationMs ) ),
    startOffset: formatDurationLabel( Math.max( 0, span.startOffsetMs ) ),
    attempt: span.attempt,
    kind: span.kind,
    step: span.technicalName
  };
};

const RulerRow: React.FC<{ trackW: number; totalMs: number }> = ( { trackW, totalMs } ) => (
  <Box>
    <Box width={COL.sel + COL.label}><Text> </Text></Box>
    <Box width={trackW}><Text dimColor>{buildRulerLine( totalMs, trackW )}</Text></Box>
    <Box width={COL.duration}><Text> </Text></Box>
  </Box>
);

const SpanRow: React.FC<{ span: Span; label: string; selected: boolean; trackW: number; totalMs: number }> =
  ( { span, label, selected, trackW, totalMs } ) => {
    const { startCol, barLen, instantaneous } = computeBar( span.startOffsetMs, span.endOffsetMs, totalMs, trackW );
    const glyph = instantaneous ? THIN_BLOCK : FULL_BLOCK;
    const bar = `${' '.repeat( startCol )}${glyph.repeat( barLen )}${' '.repeat( Math.max( 0, trackW - startCol - barLen ) )}`;
    return (
      <Box>
        <Box width={COL.sel}><SelectionIndicator selected={selected} /></Box>
        <Box width={COL.label}><Text bold={selected}>{truncate( label, COL.label - 1 )}</Text></Box>
        <Box width={trackW}><Text color={spanColor( span.status )}>{bar}</Text></Box>
        <Box width={COL.duration} justifyContent="flex-end">
          <Text dimColor={!selected}>{formatDurationLabel( Math.max( 0, span.durationMs ) )}</Text>
        </Box>
      </Box>
    );
  };

const SpanDetail: React.FC<{ span: Span | undefined; activeTab: RunStepPaneTab; label: string; rows: number }> =
  ( { span, activeTab, label, rows } ) => {
    if ( !span ) {
      return <Text dimColor>Select a step to see its input, output, and timing.</Text>;
    }
    const tabContentRows = Math.max( 1, rows - getContentTitleHeight() - getTabBarHeight() );
    return (
      <Box flexDirection="column" flexGrow={1}>
        <ContentTitle title={formatContentTitle( [ `Step "${label}"`, capitalize( activeTab ) ] )} />
        <TabBar active={activeTab} items={PANE_TABS} />
        <Box flexDirection="column">
          <JsonView value={spanPaneValue( span, activeTab )} maxLines={tabContentRows} truncateLine />
        </Box>
      </Box>
    );
  };

export const StepGraphModal: React.FC<{ run: WorkflowRun; height: number }> = ( { run, height } ) => {
  const ui = useUiState();
  const { stdout } = useStdout();
  const { spans, totalDurationMs, workflow, labels, loading, error } = useStepGraph( run.workflowId, run.runId, run.status );

  const status = run.status ?? 'unknown';
  const terminal = isTerminalRunStatus( status );

  // Tick once a second while the run is live so the axis advances between polls.
  const [ now, setNow ] = useState( () => Date.now() );
  useEffect( () => {
    const timer = terminal ? undefined : setInterval( () => setNow( Date.now() ), TICK_MS );
    return () => {
      if ( timer ) {
        clearInterval( timer );
      }
    };
  }, [ terminal ] );

  // Recorded history only reaches the last event; for a running run grow the
  // axis to elapsed wall-clock so the right edge tracks "now", not open time.
  const startMs = parseMs( workflow?.startTime ) ?? parseMs( run.startedAt );
  const liveTotalMs = terminal || startMs === null ? totalDurationMs : Math.max( totalDurationMs, now - startMs );
  const liveSpans = toLiveSpans( spans, liveTotalMs, terminal );

  const { selectedIndex, selectPrevious, selectNext } = useListSelection( liveSpans.length );
  const selectedSpan = liveSpans[selectedIndex];
  const labelFor = ( span: Span ): string => labels.get( span.id ) ?? span.name;
  const activeTab = ui.runStepPaneTab;

  useInput( ( input, key ) => {
    if ( key.escape ) {
      ui.closeStepGraph();
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
    if ( key.leftArrow || key.rightArrow ) {
      ui.setRunStepPaneTab( cycleValue( PANE_ORDER, activeTab, key.rightArrow ? 1 : -1 ) );
      return;
    }
    if ( input === 'e' && selectedSpan ) {
      ui.openExpandedJson( spanPaneValue( selectedSpan, activeTab ), `step: ${labelFor( selectedSpan )} → ${activeTab}` );
    }
  }, { isActive: ui.stepGraph.open && !ui.expandedJson.open } );

  const width = Math.max( MIN_WIDTH, ( stdout?.columns ?? FALLBACK_COLS ) - FRAME_WIDTH_OVERHEAD );
  const trackW = Math.max( MIN_TRACK, width - COL.sel - COL.label - COL.duration );
  const contentRows = Math.max( 1, height - getModalFrameHeight() - META_ROWS );

  const renderContent = (): React.ReactNode => {
    if ( error ) {
      return <Text color="red" wrap="truncate-end">Failed to load history: {error}</Text>;
    }
    if ( loading && liveSpans.length === 0 ) {
      return <LoadingSpinner label="Loading step graph..." />;
    }
    if ( liveSpans.length === 0 ) {
      return <Text dimColor>No steps recorded for this run.</Text>;
    }
    return (
      <MasterDetailPanel
        items={liveSpans}
        selectedIndex={selectedIndex}
        height={contentRows}
        visibleRows={VISIBLE_ROWS}
        renderHeader={() => <RulerRow trackW={trackW} totalMs={liveTotalMs} />}
        renderRow={( span, selected ) => (
          <SpanRow span={span} label={labelFor( span )} selected={selected} trackW={trackW} totalMs={liveTotalMs} />
        )}
        rowKey={span => span.id}
        detail={( { detailRows } ) => (
          <SpanDetail span={selectedSpan} activeTab={activeTab} label={selectedSpan ? labelFor( selectedSpan ) : ''} rows={detailRows} />
        )}
      />
    );
  };

  return (
    <ModalFrame
      title={formatContentTitle( [ `Workflow "${run.workflowType}"`, 'Step graph' ] )}
      titleRight={<Text dimColor>{formatDurationLabel( liveTotalMs )}</Text>}
      shortcuts={STEP_GRAPH_SHORTCUTS}
    >
      <Box flexDirection="column">
        <Box columnGap={2} marginBottom={1}>
          <Text color={workflowStatusColor( status )} bold>{status}</Text>
          <Text dimColor>started {formatStartedShort( run.startedAt )}</Text>
        </Box>
        {renderContent()}
      </Box>
    </ModalFrame>
  );
};
