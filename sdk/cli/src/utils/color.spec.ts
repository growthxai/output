import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { shouldColorize } from '#utils/color.js';

describe( 'shouldColorize', () => {
  const originalEnv = { ...process.env };
  const originalTTY = process.stdout.isTTY;

  beforeEach( () => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    Object.defineProperty( process.stdout, 'isTTY', { value: true, configurable: true } );
  } );

  afterEach( () => {
    process.env = { ...originalEnv };
    Object.defineProperty( process.stdout, 'isTTY', { value: originalTTY, configurable: true } );
  } );

  it( 'returns false when the flag itself is false', () => {
    expect( shouldColorize( false ) ).toBe( false );
  } );

  it( 'returns true on a TTY with no overrides', () => {
    expect( shouldColorize( true ) ).toBe( true );
  } );

  it( 'disables color when NO_COLOR is set to a non-empty value', () => {
    process.env.NO_COLOR = '1';
    expect( shouldColorize( true ) ).toBe( false );
  } );

  it( 'disables color when NO_COLOR is present but empty, per the NO_COLOR convention', () => {
    process.env.NO_COLOR = '';
    expect( shouldColorize( true ) ).toBe( false );
  } );

  it( 'enables color off a TTY when FORCE_COLOR is set', () => {
    Object.defineProperty( process.stdout, 'isTTY', { value: false, configurable: true } );
    process.env.FORCE_COLOR = '1';
    expect( shouldColorize( true ) ).toBe( true );
  } );

  it( 'disables color off a TTY with no FORCE_COLOR', () => {
    Object.defineProperty( process.stdout, 'isTTY', { value: false, configurable: true } );
    expect( shouldColorize( true ) ).toBe( false );
  } );

  it( 'NO_COLOR wins even when FORCE_COLOR is also set', () => {
    process.env.FORCE_COLOR = '1';
    process.env.NO_COLOR = '1';
    expect( shouldColorize( true ) ).toBe( false );
  } );
} );
