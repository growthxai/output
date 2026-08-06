import { describe, it, expect } from 'vitest';
import schemaParsing from './workflow.js';

describe( 'schema_parsing workflow', () => {
  const context = {
    info: {
      workflowId: 'wf-schema-parsing'
    }
  };

  it( 'coerces input, strips unknown keys, fills output defaults, and drops extra return fields', async () => {
    // Cast: exercise runtime stripping of unknown workflow input keys (not part of z.input).
    const result = await schemaParsing( {
      count: '2',
      requestId: 'req-123'
    } as { count: string }, { context } );

    expect( result ).toEqual( {
      total: 20,
      label: 'label:item',
      currency: 'USD',
      workflowId: 'wf-schema-parsing'
    } );
  } );

  it( 'applies workflow input defaults when the payload is empty', async () => {
    const result = await schemaParsing( {}, { context } );

    expect( result ).toEqual( {
      total: 10,
      label: 'label:item',
      currency: 'USD',
      workflowId: 'wf-schema-parsing'
    } );
  } );

  it( 'passes through an explicit label into the transform step', async () => {
    const result = await schemaParsing( {
      count: 5,
      label: '  Custom  '
    }, { context } );

    expect( result ).toEqual( {
      total: 50,
      label: 'label:custom',
      currency: 'USD',
      workflowId: 'wf-schema-parsing'
    } );
  } );
} );
