import { step } from '@outputai/core';
import { streamText } from '@outputai/llm';
import { workflowOutputSchema } from './types.js';

const abortReason = 'Intentional stream abort';

export const abortStream = step( {
  name: 'abortStream',
  description: 'Aborts an active LLM stream after its first text chunk',
  outputSchema: workflowOutputSchema,
  fn: async () => {
    const abortController = new AbortController();
    const state = {
      chunksBeforeAbort: 0,
      onEndCalled: false,
      onErrorCalled: false
    };

    const result = streamText( {
      prompt: 'abort_stream@v1',
      abortSignal: abortController.signal,
      onChunk( { chunk } ) {
        if ( chunk.type !== 'text-delta' || abortController.signal.aborted ) {
          return;
        }

        state.chunksBeforeAbort++;
        abortController.abort( new DOMException( abortReason, 'AbortError' ) );
      },
      onEnd() {
        state.onEndCalled = true;
      },
      onError() {
        state.onErrorCalled = true;
      }
    } );

    const observedAbort = { reason: '', sawPart: false };
    for await ( const part of result.stream ) {
      if ( part.type === 'abort' ) {
        observedAbort.sawPart = true;
        observedAbort.reason = part.reason ?? '';
      }
    }

    return {
      aborted: abortController.signal.aborted,
      sawAbortPart: observedAbort.sawPart,
      onEndCalled: state.onEndCalled,
      onErrorCalled: state.onErrorCalled,
      chunksBeforeAbort: state.chunksBeforeAbort,
      abortReason: observedAbort.reason
    };
  }
} );
