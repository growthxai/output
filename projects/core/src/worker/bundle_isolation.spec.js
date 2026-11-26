import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundleWorkflows } from './bundle.js';

async function createProject( directory, name, attempts ) {
  const core = JSON.stringify( new URL( '../index.js', import.meta.url ).href );
  await mkdir( directory );
  await writeFile( join( directory, 'package.json' ), '{"type":"module"}' );
  await writeFile( join( directory, 'workflow.js' ), `
    import { workflow, z } from ${core};
    import { probe } from './steps.js';
    export default workflow( {
      name: '${name}', description: 'Bundle isolation fixture',
      outputSchema: z.string(),
      fn: async () => probe()
    } );
  ` );
  await writeFile( join( directory, 'steps.js' ), `
    import { step, z } from ${core};
    export const probe = step( {
      name: '${name}_step', description: 'Bundle isolation step',
      outputSchema: z.string(),
      options: { activityOptions: { retry: { maximumAttempts: ${attempts} } } },
      fn: async () => '${name}'
    } );
  ` );
}

describe( 'workflow bundle input isolation', () => {
  it( 'keeps concurrent projects separate and produces stable code across identical builds', async () => {
    const root = await mkdtemp( join( tmpdir(), 'output-bundle-test-' ) );
    try {
      const alpha = join( root, 'alpha' );
      const beta = join( root, 'beta' );
      await Promise.all( [
        createProject( alpha, 'alpha_probe', 2 ),
        createProject( beta, 'beta_probe', 3 )
      ] );
      const [ a, b ] = await Promise.all( [ bundleWorkflows( alpha ), bundleWorkflows( beta ) ] );
      expect( a.code ).toContain( '"alpha_probe#alpha_probe_step":{"retry":{"maximumAttempts":2}}' );
      expect( a.code ).not.toContain( 'beta_probe' );
      expect( b.code ).toContain( '"beta_probe#beta_probe_step":{"retry":{"maximumAttempts":3}}' );
      expect( b.code ).not.toContain( 'alpha_probe' );
      expect( ( await bundleWorkflows( alpha ) ).code ).toBe( a.code );
    } finally {
      await rm( root, { recursive: true, force: true } );
    }
  }, 30_000 );
} );
