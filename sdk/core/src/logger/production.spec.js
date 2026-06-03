import { describe, expect, it } from 'vitest';
import { options } from './production.js';

const LEVEL = Symbol.for( 'level' );
const MESSAGE = Symbol.for( 'message' );

describe( 'logger/production', () => {
  it( 'uses info level and default production metadata', () => {
    expect( options.level ).toBe( 'info' );
    expect( options.defaultMeta ).toEqual( {
      service: 'output-worker',
      environment: process.env.NODE_ENV || 'development'
    } );
  } );

  it( 'formats logs as JSON with timestamp and metadata fields', () => {
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

  it( 'includes error stack when formatting Error messages', () => {
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
