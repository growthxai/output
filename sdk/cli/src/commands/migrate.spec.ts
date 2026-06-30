/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Migrate from './migrate.js';
import { ensureOutputAISystem } from '#services/coding_agents.js';
import { invokeMigrate } from '#services/claude_client.js';
import {
  hasDeprecatedWrapperPackage
} from '#services/npm_update_service.js';

vi.mock( '#services/coding_agents.js', () => ( {
  ensureOutputAISystem: vi.fn()
} ) );

vi.mock( '#services/claude_client.js', () => ( {
  invokeMigrate: vi.fn()
} ) );

vi.mock( '#services/npm_update_service.js', () => ( {
  DEPRECATED_WRAPPER_PACKAGE_WARNING: 'deprecated wrapper warning',
  hasDeprecatedWrapperPackage: vi.fn()
} ) );

describe( 'migrate command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( ensureOutputAISystem ).mockResolvedValue();
    vi.mocked( invokeMigrate ).mockResolvedValue( 'Migration complete' );
    vi.mocked( hasDeprecatedWrapperPackage ).mockResolvedValue( false );
  } );

  it( 'should warn when the deprecated wrapper package is present', async () => {
    vi.mocked( hasDeprecatedWrapperPackage ).mockResolvedValue( true );

    const cmd = new Migrate( [], {} as any );
    cmd.log = vi.fn();
    cmd.warn = vi.fn();
    ( cmd as any ).parse = vi.fn().mockResolvedValue( { flags: {}, args: {} } );

    await cmd.run();

    expect( cmd.warn ).toHaveBeenCalledWith( 'deprecated wrapper warning' );
    expect( ensureOutputAISystem ).toHaveBeenCalledWith( process.cwd() );
    expect( invokeMigrate ).toHaveBeenCalledWith( '', '', undefined );
  } );
} );
