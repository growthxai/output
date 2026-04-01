/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Reconfigure from './reconfigure.js';
import type { ReconfigurationPlan } from '#services/reconfigure_package.js';
import * as reconfigureService from '#services/reconfigure_package.js';
import { confirm } from '@inquirer/prompts';

vi.mock( '#services/reconfigure_package.js', () => ( {
  planReconfiguration: vi.fn(),
  applyReconfiguration: vi.fn()
} ) );

vi.mock( '@inquirer/prompts', () => ( {
  confirm: vi.fn()
} ) );

const basePlan = (): ReconfigurationPlan => ( {
  packageJsonPath: '/tmp/pkg/package.json',
  packageJsonUpdatedContent: '{}',
  hasChanges: true,
  scriptsToRemove: [ { key: 'dev', value: 'old' } ],
  scriptsToAdd: [ { key: 'output:new', value: 'echo new' } ],
  scriptsToReplace: [ { key: 'output:dev', before: 'old dev', after: 'output dev' } ]
} );

describe( 'reconfigure command', () => {
  const createTestCommand = () => {
    const cmd = new Reconfigure( [], {} as any );
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
    expect( Reconfigure.flags ).toBeUndefined();
  } );

  it( 'should skip confirm when no changes are needed', async () => {
    vi.mocked( reconfigureService.planReconfiguration ).mockReturnValue( {
      ...basePlan(),
      hasChanges: false
    } );

    const cmd = createTestCommand();
    await cmd.run();

    expect( confirm ).not.toHaveBeenCalled();
    expect( reconfigureService.applyReconfiguration ).not.toHaveBeenCalled();
    expect( cmd.log ).toHaveBeenCalledWith(
      'Nothing to change, package.json is already properly configured.'
    );
  } );

  it( 'should print summary, confirm, and apply when there are changes', async () => {
    vi.mocked( reconfigureService.planReconfiguration ).mockReturnValue( basePlan() );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( reconfigureService.applyReconfiguration ).mockImplementation( () => {} );

    const cmd = createTestCommand();
    await cmd.run();

    expect( confirm ).toHaveBeenCalledWith( expect.objectContaining( {
      message: 'Apply these changes to package.json?',
      default: true
    } ) );
    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'Necessary changes to package.json' ) );
    expect( reconfigureService.applyReconfiguration ).toHaveBeenCalledTimes( 1 );
    expect( cmd.log ).toHaveBeenCalledWith( 'Done, package.json is properly configured.' );
  } );

  it( 'should not apply when user declines', async () => {
    vi.mocked( reconfigureService.planReconfiguration ).mockReturnValue( basePlan() );
    vi.mocked( confirm ).mockResolvedValue( false );

    const cmd = createTestCommand();
    await cmd.run();

    expect( reconfigureService.applyReconfiguration ).not.toHaveBeenCalled();
    expect( cmd.log ).toHaveBeenCalledWith( 'Cancelled.' );
  } );

  it( 'should surface service errors', async () => {
    vi.mocked( reconfigureService.planReconfiguration ).mockImplementation( () => {
      throw new Error( 'boom' );
    } );

    const cmd = createTestCommand();
    await cmd.run();

    expect( cmd.error ).toHaveBeenCalledWith( 'boom' );
  } );
} );
