import { workflow, z } from '@outputai/core';
import wfContinueAsNew from '../continue_as_new/workflow.js';
import wfErrorType from '../error/type/workflow.js';
import wfExecuteInParallel from '../execute_in_parallel/workflow.js';
import wfNestedCallShapes from '../nested/call_shapes/workflow.js';
import wfSignals from '../signals/workflow.js';
import wfSimple from '../simple/workflow.js';
import wfTraceTest from '../test_trace/workflow.js';

type SerializedError = {
  name: string;
  message: string;
};

type ChainError = Error & {
  cause?: unknown;
  details?: Array<{ error?: unknown }>;
  type?: string;
};

const flattenErrorChain = ( error: unknown, depth = 0 ): ChainError[] =>
  !( error instanceof Error ) || depth >= 10 ? [] : [ error, ...flattenErrorChain( error.cause, depth + 1 ) ];

/** Pull { name, message } from a Temporal failure chain for e2e check output. */
const serializeError = ( error: Error ): SerializedError => {
  const chain = flattenErrorChain( error );
  const embedded = chain.flatMap( e => e.details ?? [] ).find( detail => detail?.error )?.error;
  if ( embedded && typeof embedded === 'object' && !Array.isArray( embedded ) ) {
    const { name, message } = embedded as Partial<SerializedError>;
    if ( typeof name === 'string' && typeof message === 'string' ) {
      return { name, message };
    }
  }

  const root = chain.at( -1 )!;
  return {
    name: root.type || root.constructor.name || root.name,
    message: root.message
  };
};

const checkSchema = z.object( {
  name: z.string(),
  passed: z.boolean(),
  error: z.object( {
    name: z.string(),
    message: z.string()
  } ).optional()
} );

const outputSchema = z.object( {
  passed: z.boolean(),
  checks: z.array( checkSchema )
} );

type Check = z.infer<typeof checkSchema>;
type CheckResult = Omit<Check, 'name'>;

const invokeWf = async <T>(
  fn: () => Promise<T>,
  assertion?: ( output: T ) => boolean
): Promise<CheckResult> => {
  try {
    const output = await fn();
    if ( assertion ) {
      return { passed: assertion( output ) };
    }
    return { passed: true };
  } catch ( e ) {
    if ( e instanceof Error ) {
      return { passed: false, error: serializeError( e ) };
    }
    return { passed: false, error: { name: 'Error', message: String( e ) } };
  }
};

export default workflow( {
  name: 'e2e_test',
  description: 'Workflow to smoke test features for e2e tests',
  outputSchema,
  fn: async () => {
    const checks: Check[] = [
      { name: 'simple', ...await invokeWf( () => wfSimple( { values: [ 1, 1, 1 ] } ), output => output.result === 3 ) },
      {
        name: 'continue_as_new',
        ...await invokeWf( () => wfContinueAsNew( { value: 0 } ), output => output.result === 3 )
      },
      {
        name: 'error_type',
        ...await invokeWf( () => wfErrorType(), output => output === 'User error was typed properly' )
      },
      {
        name: 'execute_in_parallel',
        ...await invokeWf( () => wfExecuteInParallel(), output => output.results.join( ',' ) === '3,6,9' )
      },
      {
        name: 'nested_call_shapes',
        ...await invokeWf(
          () => wfNestedCallShapes(),
          output => output.numbers.length === 4 && output.numbers.every( Number.isFinite )
        )
      },
      {
        name: 'signals',
        ...await invokeWf( () => wfSignals(), output =>
          output.results.join( ',' ) === '1,2,3,4' &&
          output.operationsLog.signalsSent === 3 &&
          output.operationsLog.queryResult === 3 &&
          output.operationsLog.updateResult === 4 )
      },
      { name: 'trace', ...await invokeWf( () => wfTraceTest() ) }
    ];

    return {
      passed: checks.every( check => check.passed ),
      checks
    };
  }
} );
