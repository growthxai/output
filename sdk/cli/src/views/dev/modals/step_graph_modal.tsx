import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import type { Span } from '#services/workflow_history/correlator.js';
import renderWaterfall, { formatDurationLabel } from '#utils/waterfall.js';
import { useStepGraph } from '#views/dev/hooks/use_step_graph.js';
import { isTerminalRunStatus } from '#views/dev/hooks/use_run_detail.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { ModalFrame, getHeight as getModalFrameHeight } from '#views/dev/modals/modal_frame.js';
import { workflowStatusColor } from '#views/dev/components/workflow_status.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { formatContentTitle, formatStartedShort } from '#views/dev/utils/panel_helpers.js';

// outer paddingX (2) + round border (2) + inner paddingX (2)
const FRAME_WIDTH_OVERHEAD = 6;
const META_ROWS = 2; // status/started line + its bottom margin
const FALLBACK_COLS = 100;
const MIN_WIDTH = 40;
const TICK_MS = 1_000;

const STEP_GRAPH_SHORTCUTS = [ [ 'esc', 'close' ] ] as const;

const colorEnabled = (): boolean => process.stdout.isTTY === true && !process.env.NO_COLOR;

const parseMs = ( iso: string | null | undefined ): number | null => {
  if ( !iso ) {
    return null;
  }
  const ms = Date.parse( iso );
  return Number.isNaN( ms ) ? null : ms;
};

// Stretch a still-running step's bar to the live edge so it visibly grows.
const toLiveSpans = ( spans: Span[], totalMs: number, terminal: boolean ): Span[] => {
  if ( terminal ) {
    return spans;
  }
  return spans.map( span => ( span.status === 'running' ?
    { ...span, endOffsetMs: Math.max( span.endOffsetMs, totalMs ), durationMs: Math.max( 0, totalMs - span.startOffsetMs ) } :
    span ) );
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

  useInput( ( _input, key ) => {
    if ( key.escape ) {
      ui.closeStepGraph();
    }
  }, { isActive: ui.stepGraph.open } );

  // Recorded history only reaches the last event; for a running run grow the
  // axis to elapsed wall-clock so the right edge tracks "now", not open time.
  const startMs = parseMs( workflow?.startTime ) ?? parseMs( run.startedAt );
  const liveTotalMs = terminal || startMs === null ?
    totalDurationMs :
    Math.max( totalDurationMs, now - startMs );

  const width = Math.max( MIN_WIDTH, ( stdout?.columns ?? FALLBACK_COLS ) - FRAME_WIDTH_OVERHEAD );
  const contentRows = Math.max( 1, height - getModalFrameHeight() - META_ROWS );

  const renderContent = (): React.ReactNode => {
    if ( error ) {
      return <Text color="red" wrap="truncate-end">Failed to load history: {error}</Text>;
    }
    if ( loading && spans.length === 0 ) {
      return <LoadingSpinner label="Loading step graph..." />;
    }
    if ( spans.length === 0 ) {
      return <Text dimColor>No steps recorded for this run.</Text>;
    }

    // renderWaterfall returns a terminal string with raw ANSI codes; Ink
    // preserves SGR sequences, so render it line-by-line verbatim (sharing the
    // exact renderer the `workflow history` CLI uses). Don't switch to color:false.
    const lines = renderWaterfall(
      toLiveSpans( spans, liveTotalMs, terminal ),
      liveTotalMs,
      { width, color: colorEnabled(), labels }
    ).split( '\n' );
    const visible = lines.length > contentRows ? lines.slice( 0, Math.max( 1, contentRows - 1 ) ) : lines;
    const hidden = lines.length - visible.length;

    return (
      <Box flexDirection="column">
        {visible.map( ( line, i ) => (
          <Text key={i} wrap="truncate-end">{line}</Text>
        ) )}
        {hidden > 0 ? <Text dimColor>… {hidden} more row(s) — enlarge the terminal to see all</Text> : null}
      </Box>
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
