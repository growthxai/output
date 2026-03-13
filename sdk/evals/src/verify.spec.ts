import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import { getMetadata } from '@outputai/core/sdk_utils';
import { EvaluationBooleanResult, z } from '@outputai/core';
import { Verdict } from './verdict.js';
import type { CheckContext } from './verify.js';

describe( 'verify', () => {

  it( 'returns a function with metadata matching the given name', () => {
    const ev = verify( { name: 'my_eval' }, () => Verdict.isTrue( true ) );
    const meta = getMetadata( ev as unknown as Function );
    expect( meta ).not.toBeNull();
    expect( meta!.name ).toBe( 'my_eval' );
    expect( meta!.description ).toBe( 'my_eval' );
  } );

  it( 'passes input and output to the user function', async () => {
    const captured: CheckContext[] = [];

    const ev = verify( { name: 'capture_test' }, ctx => {
      captured.push( ctx );
      return Verdict.isTrue( true );
    } );

    await ev( {
      input: { values: [ 1, 2 ] },
      output: { result: 3 },
      ground_truth: { key: 'val' }
    } );

    expect( captured ).toHaveLength( 1 );
    expect( captured[0].input ).toEqual( { values: [ 1, 2 ] } );
    expect( captured[0].output ).toEqual( { result: 3 } );
    expect( captured[0].context.ground_truth ).toEqual( { key: 'val' } );
  } );

  it( 'defaults ground_truth to empty object when undefined', async () => {
    const captured: Record<string, unknown>[] = [];

    const ev = verify( { name: 'default_ground_truth_test' }, ( { context } ) => {
      captured.push( context.ground_truth );
      return Verdict.isTrue( true );
    } );

    await ev( { input: {}, output: {} } );

    expect( captured[0] ).toEqual( {} );
  } );

  it( 'returns EvaluationResult from user fn as-is', async () => {
    const ev = verify(
      {
        name: 'return_test',
        input: z.object( { x: z.number() } ),
        output: z.object( { result: z.number() } )
      },
      ( { input, output } ) => Verdict.equals( output.result, input.x )
    );

    const result = await ev( { input: { x: 5 }, output: { result: 5 } } );

    expect( result ).toBeInstanceOf( EvaluationBooleanResult );
    expect( result.value ).toBe( true );
    expect( result.confidence ).toBe( 1.0 );
  } );

  it( 'returns failing result when assertion fails', async () => {
    const ev = verify(
      {
        name: 'fail_test',
        input: z.object( { x: z.number() } ),
        output: z.object( { result: z.number() } )
      },
      ( { input, output } ) => Verdict.equals( output.result, input.x )
    );

    const result = await ev( { input: { x: 5 }, output: { result: 10 } } );

    expect( result ).toBeInstanceOf( EvaluationBooleanResult );
    expect( result.value ).toBe( false );
    expect( result.confidence ).toBe( 1.0 );
  } );

  it( 'provides type inference via Zod schemas without as-casts', async () => {
    const ev = verify(
      {
        name: 'typed_test',
        input: z.object( { values: z.array( z.number() ) } ),
        output: z.object( { sum: z.number() } )
      },
      ( { input, output } ) =>
        Verdict.equals( output.sum, input.values.reduce( ( a, b ) => a + b, 0 ) )
    );

    const result = await ev( { input: { values: [ 1, 2, 3 ] }, output: { sum: 6 } } );
    expect( result.value ).toBe( true );
  } );
} );
