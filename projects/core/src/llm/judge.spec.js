import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { EvaluationBooleanResult, EvaluationNumberResult, EvaluationStringResult, EvaluationVerdictResult } from '#interface/evaluation_result';
import { judgeVerdict, judgeScore, judgeBoolean, judgeLabel } from './judge.js';

const mocks = vi.hoisted( () => ( {
  generateText: vi.fn(),
  outputObject: vi.fn( ( { schema } ) => ( { type: 'object', schema } ) )
} ) );

vi.mock( 'ai', () => ( { Output: { object: mocks.outputObject } } ) );
vi.mock( './generate.js', () => ( { generateText: mocks.generateText } ) );

const cases = [
  { name: 'judgeVerdict', judge: judgeVerdict, ResultClass: EvaluationVerdictResult, output: { verdict: 'partial', reasoning: 'Half done' } },
  { name: 'judgeScore', judge: judgeScore, ResultClass: EvaluationNumberResult, output: { score: 7, reasoning: 'Good' } },
  { name: 'judgeBoolean', judge: judgeBoolean, ResultClass: EvaluationBooleanResult, output: { result: false, reasoning: 'Wrong' } },
  { name: 'judgeLabel', judge: judgeLabel, ResultClass: EvaluationStringResult, output: { label: 'tech', reasoning: 'About code' } }
];

describe( 'llm/judge', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe.each( cases )( '$name', ( { judge, ResultClass, output } ) => {
    const [ value ] = Object.values( output );

    it( 'returns the judged value and reasoning as an evaluation result', async () => {
      mocks.generateText.mockResolvedValue( { output } );

      const result = await judge( { prompt: 'judge@v1', variables: { topic: 'AI' } } );

      expect( result ).toBeInstanceOf( ResultClass );
      expect( result ).toMatchObject( { value, confidence: 0.9, reasoning: output.reasoning } );
      expect( mocks.generateText ).toHaveBeenCalledWith( {
        prompt: 'judge@v1',
        variables: { topic: 'AI' },
        output: { type: 'object', schema: expect.any( z.ZodObject ) }
      } );
    } );

    it( 'uses a default schema that requires the judged field and reasoning', async () => {
      mocks.generateText.mockResolvedValue( { output } );

      await judge( { prompt: 'judge@v1' } );

      const { schema } = mocks.outputObject.mock.calls[0][0];
      expect( schema.parse( output ) ).toEqual( output );
      expect( schema.safeParse( { reasoning: output.reasoning } ).success ).toBe( false );
    } );

    it( 'uses the custom schema when given', async () => {
      const schema = z.looseObject( { reasoning: z.string() } );
      mocks.generateText.mockResolvedValue( { output: { ...output, extra: 'x' } } );

      const result = await judge( { prompt: 'judge@v1', schema } );

      expect( mocks.outputObject ).toHaveBeenCalledWith( { schema } );
      expect( result.value ).toEqual( value );
    } );
  } );

  it( 'rejects when the judged value does not match the result type', async () => {
    mocks.generateText.mockResolvedValue( { output: { score: 'high', reasoning: 'Good' } } );

    await expect( judgeScore( { prompt: 'judge@v1' } ) ).rejects.toThrow();
  } );
} );
