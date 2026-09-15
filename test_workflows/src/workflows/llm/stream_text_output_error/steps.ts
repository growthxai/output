import { step, z } from '@outputai/core';
import { aiSdk, streamText } from '@outputai/llm';
import { workflowOutputSchema } from './types.js';

const impossibleOutputSchema = z.object( {
  answer: z.string().refine( () => false, 'This schema is intentionally impossible to satisfy.' )
} );

/**
 * The consumer drives the stream here, so the output only rejects after the run finished. The step
 * reports whether onEnd fired, since that decides whether the usage comes from the response or from
 * the steps collected along the way.
 */
export const streamInvalidOutput = step( {
  name: 'streamInvalidOutput',
  description: 'streamText whose output never validates, awaited after the stream is drained',
  outputSchema: workflowOutputSchema,
  fn: async () => {
    const state = { onEndCalled: false, onErrorCalled: false, finishedSteps: 0 };

    const result = streamText( {
      prompt: 'stream_text_output_error@v1',
      output: aiSdk.Output.object( { schema: impossibleOutputSchema } ),
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
      }
    }

    const captured: { error: unknown } = { error: null };
    try {
      await result.output;
    } catch ( error ) {
      captured.error = error;
    }

    const error = captured.error instanceof Error ? captured.error : undefined;

    return {
      failed: Boolean( captured.error ),
      errorName: error?.name ?? '',
      onEndCalled: state.onEndCalled,
      onErrorCalled: state.onErrorCalled,
      finishedSteps: state.finishedSteps
    };
  }
} );
