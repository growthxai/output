/* eslint-disable @typescript-eslint/no-explicit-any */
import { workflow, z } from '@outputai/core';
import wfContinueAsNew from '../continue_as_new/workflow.js';
import wfErrorType from '../error/type/workflow.js';
import wfExecuteInParallel from '../execute_in_parallel/workflow.js';
import wfNestedCallShapes from '../nested/call_shapes/workflow.js';
import wfSignals from '../signals/workflow.js';
import wfSimple from '../simple/workflow.js';
import wfTraceTest from '../test_trace/workflow.js';

const invokeWf = async ( fn: () => Promise<unknown>, assertion?: ( output: any ) => boolean ) => {
  try {
    const output = await fn();
    if ( assertion ) {
      return { passed: assertion( output ) };
    }
    return { passed: true };
  } catch {
    return { passed: false };
  }
};

export default workflow( {
  name: 'e2e_test',
  description: 'Workflow to smoke test features for e2e tests',
  outputSchema: z.object( {
    passed: z.boolean(),
    checks: z.array( z.object( {
      name: z.string(),
      passed: z.boolean()
    } ) )
  } ),
  fn: async () => {
    const result: any = {
      passed: false,
      checks: []
    };

    result.checks.push( { name: 'simple', ...await invokeWf( () => wfSimple( { values: [ 1, 1, 1 ] } ), output => output.result === 3 ) } );
    result.checks.push( {
      name: 'continue_as_new',
      ...await invokeWf( () => wfContinueAsNew( { value: 0 } ), output => output.result === 3 )
    } );
    result.checks.push( {
      name: 'error_type',
      ...await invokeWf( () => wfErrorType(), output => output === 'User error was typed properly' )
    } );
    result.checks.push( {
      name: 'execute_in_parallel',
      ...await invokeWf( () => wfExecuteInParallel(), output => output.results.join( ',' ) === '3,6,9' )
    } );
    result.checks.push( {
      name: 'nested_call_shapes',
      ...await invokeWf(
        () => wfNestedCallShapes(),
        output => output.numbers.length === 4 && output.numbers.every( Number.isFinite )
      )
    } );
    result.checks.push( {
      name: 'signals',
      ...await invokeWf( () => wfSignals(), output =>
        output.results.join( ',' ) === '1,2,3,4' &&
        output.operationsLog.signalsSent === 3 &&
        output.operationsLog.queryResult === 3 &&
        output.operationsLog.updateResult === 4 )
    } );
    result.checks.push( { name: 'trace', ...await invokeWf( () => wfTraceTest() ) } );

    result.passed = result.checks.every( ( c: any ) => c.passed );
    return result;
  }
} );
