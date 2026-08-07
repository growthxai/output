import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { step, z } from '@outputai/core';

const apiUrl = process.env.TEST_API_URL ?? 'http://api:3001';
const workflowName = 'nested_parallel_children';
const traceDir = join( process.argv[2], 'logs/runs', workflowName );

type Trace = {
  kind: string;
  name: string;
  output: { values: string[] };
  children: Array<{ name: string; output: { value: string } }>;
};

const parseJson = ( value: string ): Trace | null => {
  try {
    return JSON.parse( value ) as Trace;
  } catch {
    return null;
  }
};
const oneSecond = 1_000;

const readTrace = async ( workflowId: string, attempts = 30 ): Promise<Trace> => {
  const files = await readdir( traceDir ).catch( () => [] );
  const filename = files.find( file => file.endsWith( `_${workflowId}.json` ) );
  const trace = filename ? parseJson( await readFile( join( traceDir, filename ), 'utf8' ) ) : null;
  if ( trace ) {
    return trace;
  }
  if ( attempts === 1 ) {
    throw new Error( `Trace not found for workflow ${workflowId}` );
  }
  await delay( oneSecond );
  return readTrace( workflowId, attempts - 1 );
};

export const runWorkflow = step( {
  name: 'runWorkflow',
  outputSchema: z.string(),
  fn: async () => {
    const response = await fetch( `${apiUrl}/workflow/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { workflowName, input: {} } )
    } );
    assert.equal( response.ok, true );

    const result = await response.json() as {
      status: string;
      output?: { values: string[] };
      workflowId: string;
      trace?: { local?: string };
    };
    assert.equal( result.status, 'completed' );
    assert.deepEqual( result.output?.values, [ 'child-1', 'child-2', 'child-3' ] );
    assert.ok( result.trace?.local?.endsWith( `_${result.workflowId}.json` ) );
    return result.workflowId as string;
  }
} );

export const assertTrace = step( {
  name: 'assertTrace',
  inputSchema: z.string(),
  fn: async ( workflowId: string ) => {
    const trace = await readTrace( workflowId );
    assert.equal( trace.kind, 'workflow' );
    assert.equal( trace.name, workflowName );
    assert.deepEqual( trace.output?.values, [ 'child-1', 'child-2', 'child-3' ] );

    const children = trace.children.filter( child => child.name === `${workflowName}_child` );
    assert.equal( children.length, 3 );
    assert.deepEqual( children.map( child => child.output.value ).sort(), [ 'child-1', 'child-2', 'child-3' ] );
  }
} );
