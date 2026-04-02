/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fix from './fix.js';
import type { FixPlan } from '#services/fix_package.js';
import * as fixService from '#services/fix_package.js';
import { confirm } from '@inquirer/prompts';

vi.mock( '#services/fix_package.js', () => ( {
  planFix: vi.fn(),
  applyFix: vi.fn()
} ) );

vi.mock( '@inquirer/prompts', () => ( {
  confirm: vi.fn()
} ) );

const basePlan = (): FixPlan => ( {
  packageJsonPath: '/tmp/pkg/package.json',
  packageJsonUpdatedContent: '{}',
  hasChanges: true,
  scriptsToRemove: [ { key: 'dev', value: 'old' } ],
  scriptsToAdd: [ { key: 'output:new', value: 'echo new' } ],
  scriptsToReplace: [ { key: 'output:dev', before: 'old dev', after: 'output dev' } ]
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
