import { afterEach, describe, expect, it, vi } from 'vitest';

const LEVEL = Symbol.for( 'level' );
const MESSAGE = Symbol.for( 'message' );

const loadProductionLogger = async () => {
  vi.resetModules();
  return import( './production.js' );
};

describe( 'logger/production', () => {
  afterEach( () => {
    vi.unstubAllEnvs();
  } );

  it( 'uses info level and default production metadata', async () => {
    const { options } = await loadProductionLogger();

    expect( options.level ).toBe( 'info' );
    expect( options.defaultMeta ).toEqual( {
      service: 'output-worker',
      environment: 'production'
    } );
  } );

  it( 'uses OUTPUT_LOG_LEVEL when configured', async () => {
    vi.stubEnv( 'OUTPUT_LOG_LEVEL', 'debug' );
    const { options } = await loadProductionLogger();

    expect( options.level ).toBe( 'debug' );
  } );

  it( 'formats logs as JSON with timestamp and metadata fields', async () => {
    const { options } = await loadProductionLogger();
    const info = options.format.transform( {
      [LEVEL]: 'info',
      level: 'info',
      message: 'Worker',
      namespace: 'Telemetry',
      status: { runState: 'RUNNING' }
    } );

    const output = JSON.parse( info[MESSAGE] );

    expect( output ).toMatchObject( {
      level: 'info',
      message: 'Worker',
      namespace: 'Telemetry',
      status: { runState: 'RUNNING' }
    } );
    expect( output.timestamp ).toEqual( expect.stringMatching( /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/u ) );
  } );

  it( 'includes error stack when formatting Error messages', async () => {
    const { options } = await loadProductionLogger();
    const error = new Error( 'boom' );
    const info = options.format.transform( {
      [LEVEL]: 'error',
      level: 'error',
      message: error
    } );

    const output = JSON.parse( info[MESSAGE] );

    expect( output ).toMatchObject( {
      level: 'error',
      message: 'boom'
    } );
    expect( output.stack ).toContain( 'Error: boom' );
  } );
} );
