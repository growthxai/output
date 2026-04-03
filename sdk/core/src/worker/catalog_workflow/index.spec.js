import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

// Provide the same symbol to the module under test and to the test
const METADATA_ACCESS_SYMBOL = Symbol( '__metadata' );
vi.mock( '#consts', () => ( {
  METADATA_ACCESS_SYMBOL
} ) );

const setMetadata = ( target, values ) =>
  Object.defineProperty( target, METADATA_ACCESS_SYMBOL, { value: values, writable: false, enumerable: false, configurable: false } );

describe( 'createCatalog', () => {
  it( 'builds catalog with activities grouped by workflow path and returns Catalog with CatalogWorkflow entries', async () => {
    const { createCatalog } = await import( './index.js' );

    const workflows = [
      {
        name: 'flow1',
        path: '/flows/flow1/workflow.js',
        description: 'desc-flow1',
        inputSchema: z.object( { in: z.literal( 'f1' ) } ),
        outputSchema: z.object( { out: z.literal( 'f1' ) } )
      },
      {
        name: 'flow2',
        path: '/flows/flow2/workflow.js',
        description: 'desc-flow2',
        inputSchema: z.object( { in: z.literal( 'f2' ) } ),
        outputSchema: z.object( { out: z.literal( 'f2' ) } )
      }
    ];

    const activity1 = () => {};
    setMetadata( activity1, {
      name: 'A1',
      path: '/flows/flow1#A1',
      description: 'desc-a1',
      inputSchema: z.object( { in: z.literal( 'a1' ) } ),
      outputSchema: z.object( { out: z.literal( 'a1' ) } )
    } );

    const activity2 = () => {};
    setMetadata( activity2, {
      name: 'A2',
      path: '/flows/flow1#A2',
      description: 'desc-a2',
      inputSchema: z.object( { in: z.literal( 'a2' ) } ),
      outputSchema: z.object( { out: z.literal( 'a2' ) } )
    } );

    const activity3 = () => {};
    setMetadata( activity3, {
      name: 'B1',
      path: '/flows/flow2#B1',
      description: 'desc-b1',
      inputSchema: z.object( { in: z.literal( 'b1' ) } ),
      outputSchema: z.object( { out: z.literal( 'b1' ) } )
    } );

    const activity4 = () => {};
    setMetadata( activity4, {
      name: 'X',
      path: '/other#X',
      description: 'desc-x',
      inputSchema: z.object( { in: z.literal( 'x' ) } ),
      outputSchema: z.object( { out: z.literal( 'x' ) } )
    } );

    const activities = {
      '/flows/flow1#A1': activity1,
      '/flows/flow1#A2': activity2,
      '/flows/flow2#B1': activity3,
      '/other#X': activity4
    };

    const catalog = createCatalog( { workflows, activities } );

    const mapped = catalog.workflows.map( w => ( {
      name: w.name,
      path: w.path,
      description: w.description,
      inputSchema: w.inputSchema,
      outputSchema: w.outputSchema,
      activities: w.activities.map( a => ( {
        name: a.name,
        description: a.description,
        inputSchema: a.inputSchema,
        outputSchema: a.outputSchema
      } ) )
    } ) );

    expect( mapped ).toEqual( [
      {
        name: 'flow1',
        path: '/flows/flow1/workflow.js',
        description: 'desc-flow1',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { in: { type: 'string', const: 'f1' } },
          required: [ 'in' ],
          additionalProperties: false
        },
        outputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { out: { type: 'string', const: 'f1' } },
          required: [ 'out' ],
          additionalProperties: false
        },
        activities: [
          {
            name: 'A1',
            description: 'desc-a1',
            inputSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: { in: { type: 'string', const: 'a1' } },
              required: [ 'in' ],
              additionalProperties: false
            },
            outputSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: { out: { type: 'string', const: 'a1' } },
              required: [ 'out' ],
              additionalProperties: false
            }
          },
          {
            name: 'A2',
            description: 'desc-a2',
            inputSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: { in: { type: 'string', const: 'a2' } },
              required: [ 'in' ],
              additionalProperties: false
            },
            outputSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: { out: { type: 'string', const: 'a2' } },
              required: [ 'out' ],
              additionalProperties: false
            }
          }
        ]
      },
      {
        name: 'flow2',
        path: '/flows/flow2/workflow.js',
        description: 'desc-flow2',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { in: { type: 'string', const: 'f2' } },
          required: [ 'in' ],
          additionalProperties: false
        },
        outputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { out: { type: 'string', const: 'f2' } },
          required: [ 'out' ],
          additionalProperties: false
        },
        activities: [
          {
            name: 'B1',
            description: 'desc-b1',
            inputSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: { in: { type: 'string', const: 'b1' } },
              required: [ 'in' ],
              additionalProperties: false
            },
            outputSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: { out: { type: 'string', const: 'b1' } },
              required: [ 'out' ],
              additionalProperties: false
            }
          }
        ]
      }
    ] );

    // Original inputs are not mutated
    expect( workflows[0].path ).toBe( '/flows/flow1/workflow.js' );
    expect( workflows[1].path ).toBe( '/flows/flow2/workflow.js' );
  } );

  it( 'includes aliases in catalog workflow entries', async () => {
    const { createCatalog } = await import( './index.js' );

    const workflows = [
      {
        name: 'flow1',
        path: '/flows/flow1/workflow.js',
        description: 'desc-flow1',
        aliases: [ 'flow1_old', 'flow1_legacy' ]
      },
      {
        name: 'flow2',
        path: '/flows/flow2/workflow.js',
        description: 'desc-flow2'
      }
    ];

    const catalog = createCatalog( { workflows, activities: {} } );

    expect( catalog.workflows[0].aliases ).toEqual( [ 'flow1_old', 'flow1_legacy' ] );
    expect( catalog.workflows[1].aliases ).toEqual( [] );
  } );
} );
