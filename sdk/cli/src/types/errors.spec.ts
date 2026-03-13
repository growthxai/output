import { describe, it, expect } from 'vitest';
import { ClaudePluginError } from './errors.js';

describe( 'ClaudePluginError', () => {
  it( 'should instantiate with command name and original error', () => {
    const originalError = new Error( 'Connection failed' );
    const error = new ClaudePluginError( 'plugin update outputai', originalError );

    expect( error ).toBeInstanceOf( Error );
    expect( error ).toBeInstanceOf( ClaudePluginError );
    expect( error.commandName ).toBe( 'plugin update outputai' );
    expect( error.originalError ).toBe( originalError );
  } );

  it( 'should format error message to include command context', () => {
    const originalError = new Error( 'Command not found' );
    const error = new ClaudePluginError( 'plugin install outputai@outputai', originalError );

    expect( error.message ).toContain( 'plugin install outputai@outputai' );
    expect( error.message ).toContain( 'Command not found' );
  } );
} );
