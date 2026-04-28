import { describe, it, expect } from 'vitest';
import { EventAction } from '../trace_consts.js';
import buildTraceTree from './build_trace_tree.js';

describe( 'build_trace_tree', () => {
  it( 'returns null when entries is empty', () => {
    expect( buildTraceTree( [] ) ).toBeNull();
  } );

  it( 'sets root output with a fixed message when workflow has no end/error action yet', () => {
    const entries = [
      { kind: 'workflow', id: 'wf', parentId: undefined, action: EventAction.START, name: 'wf', details: {}, timestamp: 1000 }
    ];
    const result = buildTraceTree( entries );
    expect( result ).not.toBeNull();
    expect( result.output ).toBe( '<<Workflow did not finish yet. If this workflows is supposed to have been completed already, \
this can indicate it timed out or was interrupted.>>' );
    expect( result.endedAt ).toBeNull();
  } );

  it( 'returns null when there is no root (all entries have parentId)', () => {
    const entries = [
      { id: 'a', parentId: 'x', action: EventAction.START, name: 'a', timestamp: 1 },
      { id: 'b', parentId: 'a', action: EventAction.START, name: 'b', timestamp: 2 }
    ];
    expect( buildTraceTree( entries ) ).toBeNull();
  } );

  it( 'add_attr action merges details.name and details.value into node.attributes', () => {
    const entries = [
      { kind: 'workflow', id: 'wf', parentId: undefined, action: EventAction.START, name: 'wf', details: {}, timestamp: 100 },
      { kind: 'step', id: 's', parentId: 'wf', action: EventAction.START, name: 'step', details: {}, timestamp: 200 },
      { id: 's', action: EventAction.ADD_ATTR, details: { name: 'latency_ms', value: 42 }, timestamp: 250 },
      { id: 's', action: EventAction.ADD_ATTR, details: { name: 'retries', value: 1 }, timestamp: 260 },
      { id: 'wf', action: EventAction.END, details: {}, timestamp: 300 }
    ];
    const result = buildTraceTree( entries );
    expect( result ).not.toBeNull();
    expect( result.children[0].attributes ).toEqual( { latency_ms: 42, retries: 1 } );
  } );

  it( 'add_attr action overwrites prior value for the same attribute name', () => {
    const entries = [
      { kind: 'workflow', id: 'wf', parentId: undefined, action: EventAction.START, name: 'wf', details: {}, timestamp: 1 },
      { id: 'wf', action: EventAction.ADD_ATTR, details: { name: 'x', value: 1 }, timestamp: 2 },
      { id: 'wf', action: EventAction.ADD_ATTR, details: { name: 'x', value: 2 }, timestamp: 3 },
      { id: 'wf', action: EventAction.END, details: {}, timestamp: 4 }
    ];
    const result = buildTraceTree( entries );
    expect( result.attributes ).toEqual( { x: 2 } );
  } );

  it( 'add_attr does not attach nodes as children (only start does)', () => {
    const entries = [
      { kind: 'workflow', id: 'wf', parentId: undefined, action: EventAction.START, name: 'wf', details: {}, timestamp: 1 },
      { id: 'orphan', parentId: 'wf', action: EventAction.ADD_ATTR, details: { name: 'k', value: 'v' }, timestamp: 2 },
      { id: 'wf', action: EventAction.END, details: {}, timestamp: 3 }
    ];
    const result = buildTraceTree( entries );
    expect( result.children ).toHaveLength( 0 );
    expect( result.attributes ).toEqual( {} );
  } );

  it( 'error action sets error and endedAt on node', () => {
    const entries = [
      { kind: 'wf', id: 'r', parentId: undefined, action: EventAction.START, name: 'root', details: {}, timestamp: 100 },
      { kind: 'step', id: 's', parentId: 'r', action: EventAction.START, name: 'step', details: {}, timestamp: 200 },
      { id: 's', action: EventAction.ERROR, details: { message: 'failed' }, timestamp: 300 }
    ];
    const result = buildTraceTree( entries );
    expect( result ).not.toBeNull();
    expect( result.children ).toHaveLength( 1 );
    expect( result.children[0].error ).toEqual( { message: 'failed' } );
    expect( result.children[0].endedAt ).toBe( 300 );
  } );

  it( 'builds a tree from workflow/step/IO entries with grouping and sorting', () => {
    const entries = [
      // workflow start
      { kind: 'workflow', action: EventAction.START, name: 'wf', id: 'wf', parentId: undefined, details: { a: 1 }, timestamp: 1000 },
      // evaluator start/stop
      { kind: 'evaluator', action: EventAction.START, name: 'eval', id: 'eval', parentId: 'wf', details: { z: 0 }, timestamp: 1500 },
      { id: 'eval', action: EventAction.END, details: { z: 1 }, timestamp: 1600 },
      // step1 start
      { kind: 'step', action: EventAction.START, name: 'step-1', id: 's1', parentId: 'wf', details: { x: 1 }, timestamp: 2000 },
      { id: 's1', action: EventAction.ADD_ATTR, details: { name: 'step_tag', value: 'alpha' }, timestamp: 2050 },
      // IO under step1
      { kind: 'IO', action: EventAction.START, name: 'test-1', id: 'io1', parentId: 's1', details: { y: 2 }, timestamp: 2300 },
      // step2 start
      { kind: 'step', action: EventAction.START, name: 'step-2', id: 's2', parentId: 'wf', details: { x: 2 }, timestamp: 2400 },
      // IO under step2
      { kind: 'IO', action: EventAction.START, name: 'test-2', id: 'io2', parentId: 's2', details: { y: 3 }, timestamp: 2500 },
      { id: 'io2', action: EventAction.END, details: { y: 4 }, timestamp: 2600 },
      // IO under step1 ends
      { id: 'io1', action: EventAction.END, details: { y: 5 }, timestamp: 2700 },
      // step1 end
      { id: 's1', action: EventAction.END, details: { done: true }, timestamp: 2800 },
      // step2 end
      { id: 's2', action: EventAction.END, details: { done: true }, timestamp: 2900 },
      // workflow end
      { id: 'wf', action: EventAction.END, details: { ok: true }, timestamp: 3000 }
    ];

    const result = buildTraceTree( entries );

    const expected = {
      id: 'wf',
      kind: 'workflow',
      name: 'wf',
      startedAt: 1000,
      endedAt: 3000,
      input: { a: 1 },
      output: { ok: true },
      attributes: {},
      children: [
        {
          id: 'eval',
          kind: 'evaluator',
          name: 'eval',
          startedAt: 1500,
          endedAt: 1600,
          input: { z: 0 },
          output: { z: 1 },
          attributes: {},
          children: []
        },
        {
          id: 's1',
          kind: 'step',
          name: 'step-1',
          startedAt: 2000,
          endedAt: 2800,
          input: { x: 1 },
          output: { done: true },
          attributes: { step_tag: 'alpha' },
          children: [
            {
              id: 'io1',
              kind: 'IO',
              name: 'test-1',
              startedAt: 2300,
              endedAt: 2700,
              input: { y: 2 },
              output: { y: 5 },
              attributes: {},
              children: []
            }
          ]
        },
        {
          id: 's2',
          kind: 'step',
          name: 'step-2',
          startedAt: 2400,
          endedAt: 2900,
          input: { x: 2 },
          output: { done: true },
          attributes: {},
          children: [
            {
              id: 'io2',
              kind: 'IO',
              name: 'test-2',
              startedAt: 2500,
              endedAt: 2600,
              input: { y: 3 },
              output: { y: 4 },
              attributes: {},
              children: []
            }
          ]
        }
      ]
    };

    expect( result ).toMatchObject( expected );
  } );
} );
