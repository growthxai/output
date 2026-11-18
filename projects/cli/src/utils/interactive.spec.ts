import { describe, it, expect, beforeEach } from 'vitest';

describe( 'interactive', () => {
  beforeEach( async () => {
    // Re-import to reset singleton state
    const mod = await import( './interactive.js' );
    mod.setNonInteractive( false );
  } );

  it( 'isInteractive returns true by default when TTY is available', async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty( process.stdin, 'isTTY', { value: true, configurable: true } );

    const { isInteractive } = await import( './interactive.js' );
    expect( isInteractive() ).toBe( true );

    Object.defineProperty( process.stdin, 'isTTY', { value: originalIsTTY, configurable: true } );
  } );

  it( 'isInteractive returns false when no TTY', async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty( process.stdin, 'isTTY', { value: undefined, configurable: true } );

    const { isInteractive } = await import( './interactive.js' );
    expect( isInteractive() ).toBe( false );

    Object.defineProperty( process.stdin, 'isTTY', { value: originalIsTTY, configurable: true } );
  } );

  it( 'isInteractive returns false after setNonInteractive(true)', async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty( process.stdin, 'isTTY', { value: true, configurable: true } );

    const { isInteractive, setNonInteractive } = await import( './interactive.js' );
    setNonInteractive( true );
    expect( isInteractive() ).toBe( false );

    Object.defineProperty( process.stdin, 'isTTY', { value: originalIsTTY, configurable: true } );
  } );

  it( 'setNonInteractive(false) restores interactive mode', async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty( process.stdin, 'isTTY', { value: true, configurable: true } );

    const { isInteractive, setNonInteractive } = await import( './interactive.js' );
    setNonInteractive( true );
    expect( isInteractive() ).toBe( false );
    setNonInteractive( false );
    expect( isInteractive() ).toBe( true );

    Object.defineProperty( process.stdin, 'isTTY', { value: originalIsTTY, configurable: true } );
  } );
} );
