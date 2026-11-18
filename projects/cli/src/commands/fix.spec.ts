/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fix from './fix.js';
import type { FixPlan } from '#services/fix_package.js';
import * as fixService from '#services/fix_package.js';
import { confirm } from '#utils/prompt.js';

vi.mock( '#services/fix_package.js', () => ( {
  planFix: vi.fn(),
  applyFix: vi.fn()
} ) );

vi.mock( '#utils/prompt.js', () => ( {
  confirm: vi.fn()
} ) );

const basePlan = (): FixPlan => ( {
  packageJsonPath: '/tmp/pkg/package.json',
  packageJsonUpdatedContent: '{}',
  hasChanges: true,
  scriptsToRemove: [ { key: 'dev', value: 'old' } ],
  scriptsToAdd: [ { key: 'output:new', value: 'echo new' } ],
  scriptsToReplace: [ { key: 'output:dev', before: 'old dev', after: 'output dev' } ],
  dependenciesToRemove: [],
  dependenciesToAdd: [],
  hookFilesToRemove: []
} );

describe( 'fix command', () => {
  const createTestCommand = () => {
    const cmd = new Fix( [], {} as any );
    cmd.log = vi.fn();
    cmd.warn = vi.fn();
    cmd.error = vi.fn() as any;
    ( cmd as any ).debug = vi.fn();
    ( cmd as any ).parse = vi.fn().mockResolvedValue( { flags: {}, args: {} } );
    return cmd;
  };

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should have no flags', () => {
    expect( Fix.flags ).toBeUndefined();
  } );

  it( 'should skip confirm when no changes are needed', async () => {
    vi.mocked( fixService.planFix ).mockReturnValue( {
      ...basePlan(),
      hasChanges: false
    } );

    const cmd = createTestCommand();
    await cmd.run();

    expect( confirm ).not.toHaveBeenCalled();
    expect( fixService.applyFix ).not.toHaveBeenCalled();
    expect( cmd.log ).toHaveBeenCalledWith(
      'Nothing to change, package.json is already properly configured.'
    );
  } );

  it( 'should print summary, confirm, and apply when there are changes', async () => {
    vi.mocked( fixService.planFix ).mockReturnValue( basePlan() );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( fixService.applyFix ).mockImplementation( () => {} );

    const cmd = createTestCommand();
    await cmd.run();

    expect( confirm ).toHaveBeenCalledWith( expect.objectContaining( {
      message: 'Apply these changes to package.json?',
      default: true
    } ) );
    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'Necessary changes to package.json' ) );
    expect( fixService.applyFix ).toHaveBeenCalledTimes( 1 );
    expect( cmd.log ).toHaveBeenCalledWith( 'Done, package.json is properly configured.' );
  } );

  it( 'should list hook files to remove', async () => {
    vi.mocked( fixService.planFix ).mockReturnValue( {
      ...basePlan(),
      hookFilesToRemove: [ 'node_modules/@outputai/credentials/dist/hooks.js' ]
    } );
    vi.mocked( confirm ).mockResolvedValue( false );

    const cmd = createTestCommand();
    await cmd.run();

    expect( cmd.log ).toHaveBeenCalledWith( '\n  Hook files to remove:' );
    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( '"node_modules/@outputai/credentials/dist/hooks.js"' ) );
  } );

  it( 'should list dependencies to replace and hint to reinstall after applying', async () => {
    vi.mocked( fixService.planFix ).mockReturnValue( {
      ...basePlan(),
      dependenciesToRemove: [ { section: 'dependencies', name: '@outputai/output', version: '^0.15.0' } ],
      dependenciesToAdd: [
        { section: 'dependencies', name: '@outputai/core', version: '^0.15.0' },
        { section: 'devDependencies', name: '@outputai/cli', version: '^0.15.0' }
      ]
    } );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( fixService.applyFix ).mockImplementation( () => {} );

    const cmd = createTestCommand();
    await cmd.run();

    expect( cmd.log ).toHaveBeenCalledWith( '\n  Dependencies to replace:' );
    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( '"@outputai/output": "^0.15.0" (dependencies)' ) );
    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( '"@outputai/core": "^0.15.0" (dependencies)' ) );
    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( '"@outputai/cli": "^0.15.0" (devDependencies)' ) );
    expect( cmd.log ).toHaveBeenCalledWith(
      'Dependencies changed: run your package manager install to update node_modules and the lockfile.'
    );
  } );

  it( 'should not hint to reinstall when dependencies did not change', async () => {
    vi.mocked( fixService.planFix ).mockReturnValue( basePlan() );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( fixService.applyFix ).mockImplementation( () => {} );

    const cmd = createTestCommand();
    await cmd.run();

    expect( cmd.log ).not.toHaveBeenCalledWith( '\n  Dependencies to replace:' );
    expect( cmd.log ).not.toHaveBeenCalledWith( expect.stringContaining( 'Dependencies changed' ) );
  } );

  it( 'should not apply when user declines', async () => {
    vi.mocked( fixService.planFix ).mockReturnValue( basePlan() );
    vi.mocked( confirm ).mockResolvedValue( false );

    const cmd = createTestCommand();
    await cmd.run();

    expect( fixService.applyFix ).not.toHaveBeenCalled();
  } );

  it( 'should surface service errors', async () => {
    vi.mocked( fixService.planFix ).mockImplementation( () => {
      throw new Error( 'boom' );
    } );

    const cmd = createTestCommand();
    await cmd.run();

    expect( cmd.error ).toHaveBeenCalledWith( 'boom' );
  } );
} );
