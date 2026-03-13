import { describe, it, expect } from 'vitest';
import buildTraceTree from './build_trace_tree.js';

describe( 'build_trace_tree', () => {
  it( 'returns null when entries is empty', () => {
    expect( buildTraceTree( [] ) ).toBeNull();
  } );

  it( 'sets root output with a fixed message when workflow has no end/error phase yet', () => {
    const entries = [
      { kind: 'workflow', id: 'wf', parentId: undefined, phase: 'start', name: 'wf', details: {}, timestamp: 1000 }
    ];
    const result = buildTraceTree( entries );
    expect( result ).not.toBeNull();
    expect( result.output ).toBe( '<<Workflow did not finish yet. If this workflows is supposed to have been completed already, \
this can indicate it timed out or was interrupted.>>' );
    expect( result.endedAt ).toBeNull();
  } );

  it( 'returns null when there is no root (all entries have parentId)', () => {
    const entries = [
      { id: 'a', parentId: 'x', phase: 'start', name: 'a', timestamp: 1 },
      { id: 'b', parentId: 'a', phase: 'start', name: 'b', timestamp: 2 }
    ];
    expect( buildTraceTree( entries ) ).toBeNull();
  } );

  it( 'error phase sets error and endedAt on node', () => {
    const entries = [
      { kind: 'wf', id: 'r', parentId: undefined, phase: 'start', name: 'root', details: {}, timestamp: 100 },
      { kind: 'step', id: 's', parentId: 'r', phase: 'start', name: 'step', details: {}, timestamp: 200 },
      { id: 's', phase: 'error', details: { message: 'failed' }, timestamp: 300 }
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
      { kind: 'workflow', phase: 'start', name: 'wf', id: 'wf', parentId: undefined, details: { a: 1 }, timestamp: 1000 },
      // evaluator start/stop
      { kind: 'evaluator', phase: 'start', name: 'eval', id: 'eval', parentId: 'wf', details: { z: 0 }, timestamp: 1500 },
      { id: 'eval', phase: 'end', details: { z: 1 }, timestamp: 1600 },
      // step1 start
      { kind: 'step', phase: 'start', name: 'step-1', id: 's1', parentId: 'wf', details: { x: 1 }, timestamp: 2000 },
      // IO under step1
      { kind: 'IO', phase: 'start', name: 'test-1', id: 'io1', parentId: 's1', details: { y: 2 }, timestamp: 2300 },
      // step2 start
      { kind: 'step', phase: 'start', name: 'step-2', id: 's2', parentId: 'wf', details: { x: 2 }, timestamp: 2400 },
      // IO under step2
      { kind: 'IO', phase: 'start', name: 'test-2', id: 'io2', parentId: 's2', details: { y: 3 }, timestamp: 2500 },
      { id: 'io2', phase: 'end', details: { y: 4 }, timestamp: 2600 },
      // IO under step1 ends
      { id: 'io1', phase: 'end', details: { y: 5 }, timestamp: 2700 },
      // step1 end
      { id: 's1', phase: 'end', details: { done: true }, timestamp: 2800 },
      // step2 end
      { id: 's2', phase: 'end', details: { done: true }, timestamp: 2900 },
      // workflow end
      { id: 'wf', phase: 'end', details: { ok: true }, timestamp: 3000 }
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
      children: [
        {
          id: 'eval',
          kind: 'evaluator',
          name: 'eval',
          startedAt: 1500,
          endedAt: 1600,
          input: { z: 0 },
          output: { z: 1 },
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
          children: [
            {
              id: 'io1',
              kind: 'IO',
              name: 'test-1',
              startedAt: 2300,
              endedAt: 2700,
              input: { y: 2 },
              output: { y: 5 },
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
          children: [
            {
              id: 'io2',
              kind: 'IO',
              name: 'test-2',
              startedAt: 2500,
              endedAt: 2600,
              input: { y: 3 },
              output: { y: 4 },
              children: []
            }
          ]
        }
      ]
    };

    expect( result ).toMatchObject( expected );
  } );
} );
