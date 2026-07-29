/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '@oclif/core', () => ( {
  ux: {
    stdout: vi.fn(),
    stderr: vi.fn(),
    error: vi.fn( () => {
      throw new Error( 'ux.error called' );
    } )
  }
} ) );

vi.mock( '#utils/input_parser.js', () => ( {
  parseInputFlag: vi.fn()
} ) );

vi.mock( '#utils/scenario_resolver.js', () => ( {
  resolveScenarioPath: vi.fn(),
  getScenarioNotFoundMessage: vi.fn()
} ) );

describe( 'resolveInput', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'emits the scenario notice on stderr so --json stdout stays clean', async () => {
    const { ux } = await import( '@oclif/core' );
    const { parseInputFlag } = await import( '#utils/input_parser.js' );
    const { resolveScenarioPath } = await import( '#utils/scenario_resolver.js' );
    const { resolveInput } = await import( './resolve_input.js' );

    vi.mocked( resolveScenarioPath ).mockResolvedValue( {
      found: true,
      path: '/scenarios/happy_path.json'
    } as any );
    vi.mocked( parseInputFlag ).mockReturnValue( { key: 'value' } );

    const result = await resolveInput( 'web_search', 'happy_path', undefined, 'start' );

    expect( result ).toEqual( { key: 'value' } );
    expect( ux.stderr ).toHaveBeenCalledWith( 'Using scenario: /scenarios/happy_path.json\n' );
    expect( ux.stdout ).not.toHaveBeenCalled();
  } );

  it( 'does not emit the scenario notice when input comes from --input', async () => {
    const { ux } = await import( '@oclif/core' );
    const { parseInputFlag } = await import( '#utils/input_parser.js' );
    const { resolveInput } = await import( './resolve_input.js' );

    vi.mocked( parseInputFlag ).mockReturnValue( { key: 'value' } );

    await resolveInput( 'web_search', undefined, '{"key":"value"}', 'start' );

    expect( ux.stderr ).not.toHaveBeenCalled();
    expect( ux.stdout ).not.toHaveBeenCalled();
  } );
} );
