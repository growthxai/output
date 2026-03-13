import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sumValues } from './steps.js';

vi.mock( './steps.js', () => ( {
  sumValues: vi.fn()
} ) );

import simple from './workflow.js';

describe( 'simple workflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'Should call sumValues step and return the sum result', async () => {
    const sum = 45;
    vi.mocked( sumValues ).mockResolvedValue( sum );

    const context = {
      info: {
        workflowId: 'foo'
      }
    };
    const input = { values: [ 10, 15, 20 ] };
    const result = await simple( input, { context } );

    expect( sumValues ).toHaveBeenCalledWith( input.values );
    expect( sumValues ).toHaveBeenCalledTimes( 1 );
    expect( result.workflowId ).toBe( 'foo' );
    expect( result.result ).toBe( sum );
  } );
} );
