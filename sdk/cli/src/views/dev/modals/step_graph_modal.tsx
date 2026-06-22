import React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import renderWaterfall, { formatDurationLabel } from '#utils/waterfall.js';
import { useStepGraph } from '#views/dev/hooks/use_step_graph.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { ModalFrame, getHeight as getModalFrameHeight } from '#views/dev/modals/modal_frame.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { formatContentTitle } from '#views/dev/utils/panel_helpers.js';

// round border (2) + paddingX 1 either side (2)
const FRAME_WIDTH_OVERHEAD = 4;
const FALLBACK_COLS = 100;
const MIN_WIDTH = 40;

const STEP_GRAPH_SHORTCUTS = [ [ 'esc', 'close' ] ] as const;

// Match the CLI command's gate (NO_COLOR + TTY); the dev TUI always runs in a TTY.
const colorEnabled = (): boolean => process.stdout.isTTY === true && !process.env.NO_COLOR;

export const StepGraphModal: React.FC<{ run: WorkflowRun; height: number }> = ( { run, height } ) => {
  const ui = useUiState();
  const { stdout } = useStdout();
  const { spans, totalDurationMs, labels, loading, error } = useStepGraph( run.workflowId, run.runId, run.status );

  useInput( ( _input, key ) => {
    if ( key.escape ) {
      ui.closeStepGraph();
    }
  }, { isActive: ui.stepGraph.open } );

  const contentRows = Math.max( 1, height - getModalFrameHeight() );
  const width = Math.max( MIN_WIDTH, ( stdout?.columns ?? FALLBACK_COLS ) - FRAME_WIDTH_OVERHEAD );

  const renderBody = (): React.ReactNode => {
    if ( loading && spans.length === 0 ) {
      return <LoadingSpinner label="Loading step graph..." />;
    }
    if ( error ) {
      return <Text color="red" wrap="truncate-end">Failed to load history: {error}</Text>;
    }
    if ( spans.length === 0 ) {
      return <Text dimColor>No steps recorded for this run.</Text>;
    }

    // `renderWaterfall` returns a terminal string with raw ANSI color codes.
    // Ink preserves SGR sequences, so we render it line-by-line verbatim —
    // sharing the exact renderer the `workflow history` CLI uses instead of
    // rebuilding bars as Ink nodes. Don't switch this to color:false.
    const lines = renderWaterfall( spans, totalDurationMs, { width, color: colorEnabled(), labels } ).split( '\n' );
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
      titleRight={<Text dimColor>{formatDurationLabel( totalDurationMs )}</Text>}
      shortcuts={STEP_GRAPH_SHORTCUTS}
    >
      {renderBody()}
    </ModalFrame>
  );
};
