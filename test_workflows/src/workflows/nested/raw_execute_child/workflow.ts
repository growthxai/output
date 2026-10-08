import { workflow, z } from '@outputai/core';
import { executeChild, workflowInfo } from '@temporalio/workflow';

const childOutput = z.object( {
  label: z.string(),
  searchAttributes: z.record( z.string(), z.unknown() )
} );

/*
  Starts the same child workflow twice with a raw executeChild:
  - "without-memo": no memo passed. Traced only when the framework injects the parent trace context.
  - "with-memo": parent memo passed explicitly. Traced on any version, so it works as a control.
  Each child makes an HTTP request with a cost, and returns the search attributes it sees.
  Run with: output workflow run nested_raw_execute_child --input '{}' --search-attributes '{"WorkspaceId":"demo"}'
*/
export default workflow( {
  name: 'nested_raw_execute_child',
  description: 'Raw executeChild children with and without an explicit memo',
  outputSchema: z.object( {
    withoutMemo: childOutput,
    withMemo: childOutput
  } ),
  fn: async () => {
    const withoutMemo = await executeChild( 'nested_raw_execute_child_child', {
      args: [ { label: 'without-memo' } ]
    } );
    const withMemo = await executeChild( 'nested_raw_execute_child_child', {
      args: [ { label: 'with-memo' } ],
      memo: workflowInfo().memo
    } );

    return { withoutMemo, withMemo };
  }
} );
