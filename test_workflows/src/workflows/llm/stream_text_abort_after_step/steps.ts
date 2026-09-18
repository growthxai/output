import { step, z } from '@outputai/core';
import { aiSdk, streamText } from '@outputai/llm';
import { workflowOutputSchema } from './types.js';

/** Resolves immediately, so the tool loop moves on to a second step where the abort can land */
const getTime = aiSdk.tool( {
  description: 'Get the current time as an ISO string',
  inputSchema: z.object( {} ),
  execute: async () => new Date().toISOString()
} );

/**
 * Unlike stream_text_abort, which cancels on the first text chunk and therefore has no usage to
 * bill, this one cancels only after a step finished. The tokens of that step are already reported,
 * so the llm trace node should carry usage and cost next to the abort error.
 */
export const abortStreamAfterStep = step( {
  name: 'abortStreamAfterStep',
  description: 'Aborts an LLM stream after its first step reported usage',
  outputSchema: workflowOutputSchema,
  fn: async () => {
    const abortController = new AbortController();
    const state = {
      finishedSteps: 0,
      sawAbortPart: false,
      onEndCalled: false,
      onErrorCalled: false
    };

    const result = streamText( {
      prompt: 'abort_after_step@v1',
      // every step must call a tool, which guarantees the loop starts a second one
      toolChoice: 'required',
      tools: { get_time: getTime },
      abortSignal: abortController.signal,
      onEnd() {
        state.onEndCalled = true;
      },
      onError() {
        state.onErrorCalled = true;
      }
    } );

    for await ( const part of result.stream ) {
      if ( part.type === 'finish-step' ) {
        state.finishedSteps++;

        if ( state.finishedSteps === 1 ) {
          abortController.abort( new DOMException( 'Abort after the first step', 'AbortError' ) );
        }
      }

      if ( part.type === 'abort' ) {
        state.sawAbortPart = true;
      }
    }

    return {
      aborted: abortController.signal.aborted,
      finishedSteps: state.finishedSteps,
      sawAbortPart: state.sawAbortPart,
      onEndCalled: state.onEndCalled,
      onErrorCalled: state.onErrorCalled
    };
  }
} );
