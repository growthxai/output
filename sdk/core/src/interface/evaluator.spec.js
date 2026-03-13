import { describe, it, expect } from 'vitest';
import {
  EvaluationResult,
  EvaluationStringResult,
  EvaluationNumberResult,
  EvaluationBooleanResult,
  EvaluationFeedback
} from './evaluation_result.js';
import { ValidationError } from '#errors';

describe( 'interface/evaluator - EvaluationResult classes', () => {
  describe( 'class inheritance', () => {
    it( 'subclasses extend EvaluationResult', () => {
      const s = new EvaluationStringResult( { value: 'ok', confidence: 0.8 } );
      const n = new EvaluationNumberResult( { value: 42, confidence: 1 } );
      const b = new EvaluationBooleanResult( { value: true, confidence: 0.5 } );

      expect( s ).toBeInstanceOf( EvaluationResult );
      expect( n ).toBeInstanceOf( EvaluationResult );
      expect( b ).toBeInstanceOf( EvaluationResult );
    } );
  } );

  describe( 'constructor payload validation', () => {
    it( 'base class validates presence and types of common fields', () => {
      // valid
      const base = new EvaluationResult( { value: { any: 'thing' }, confidence: 0.1 } );
      expect( base.value ).toEqual( { any: 'thing' } );
      expect( base.confidence ).toBe( 0.1 );
      expect( base.reasoning ).toBeUndefined();

      // invalid: missing confidence
      expect( () => new EvaluationResult( { value: 1 } ) ).toThrow( ValidationError );

      // invalid: confidence wrong type
      expect( () => new EvaluationResult( { value: 'x', confidence: 'nope' } ) ).toThrow( ValidationError );

      // invalid: reasoning wrong type
      expect( () => new EvaluationResult( { value: 'x', confidence: 1, reasoning: 123 } ) ).toThrow( ValidationError );
    } );

    it( 'string subclass enforces string value', () => {
      // valid
      const r = new EvaluationStringResult( { value: 'hello', confidence: 0.9 } );
      expect( r.value ).toBe( 'hello' );

      // invalid
      expect( () => new EvaluationStringResult( { value: 123, confidence: 0.2 } ) ).toThrow( ValidationError );
    } );

    it( 'number subclass enforces number value', () => {
      // valid
      const r = new EvaluationNumberResult( { value: 123, confidence: 0.2 } );
      expect( r.value ).toBe( 123 );

      // invalid
      expect( () => new EvaluationNumberResult( { value: 'nope', confidence: 0.2 } ) ).toThrow( ValidationError );
    } );

    it( 'boolean subclass enforces boolean value', () => {
      // valid
      const r = new EvaluationBooleanResult( { value: true, confidence: 1 } );
      expect( r.value ).toBe( true );

      // invalid
      expect( () => new EvaluationBooleanResult( { value: 'nope', confidence: 0.2 } ) ).toThrow( ValidationError );
    } );
  } );

  describe( 'static schema getter', () => {
    it( 'base schema accepts any value and optional reasoning', () => {
      const ok = EvaluationResult.schema.safeParse( { value: 'x', confidence: 0.5, reasoning: 'why' } );
      expect( ok.success ).toBe( true );

      const ok2 = EvaluationResult.schema.safeParse( { value: 123, confidence: 0.5 } );
      expect( ok2.success ).toBe( true );
    } );

    it( 'string schema requires value to be string', () => {
      const ok = EvaluationStringResult.schema.safeParse( { value: 'x', confidence: 1 } );
      expect( ok.success ).toBe( true );

      const bad = EvaluationStringResult.schema.safeParse( { value: 123, confidence: 1 } );
      expect( bad.success ).toBe( false );
    } );

    it( 'number schema requires value to be number', () => {
      const ok = EvaluationNumberResult.schema.safeParse( { value: 10, confidence: 1 } );
      expect( ok.success ).toBe( true );

      const bad = EvaluationNumberResult.schema.safeParse( { value: '10', confidence: 1 } );
      expect( bad.success ).toBe( false );
    } );

    it( 'boolean schema requires value to be boolean', () => {
      const ok = EvaluationBooleanResult.schema.safeParse( { value: false, confidence: 1 } );
      expect( ok.success ).toBe( true );

      const bad = EvaluationBooleanResult.schema.safeParse( { value: 'false', confidence: 1 } );
      expect( bad.success ).toBe( false );
    } );

    it( 'schema getter does not cause infinite recursion', () => {
      // Access schema multiple times to ensure no stack overflow
      const schema1 = EvaluationResult.schema;
      const schema2 = EvaluationResult.schema;
      const schema3 = EvaluationStringResult.schema;
      const schema4 = EvaluationNumberResult.schema;
      const schema5 = EvaluationBooleanResult.schema;

      expect( schema1 ).toBeDefined();
      expect( schema2 ).toBeDefined();
      expect( schema3 ).toBeDefined();
      expect( schema4 ).toBeDefined();
      expect( schema5 ).toBeDefined();

      // Verify schemas can be used for validation
      const result = schema1.safeParse( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: 'dim1', confidence: 0.9 },
          { value: 42, confidence: 0.8 }
        ]
      } );
      expect( result.success ).toBe( true );
    } );

    it( 'schema includes dimensions field', () => {
      const schema = EvaluationResult.schema;
      const result = schema.safeParse( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: 'string-dim', confidence: 0.9 },
          { value: 42, confidence: 0.8 },
          { value: true, confidence: 0.7 }
        ]
      } );
      expect( result.success ).toBe( true );
      if ( result.success ) {
        expect( result.data.dimensions ).toHaveLength( 3 );
      }
    } );

    it( 'schema validates dimensions value types', () => {
      const schema = EvaluationResult.schema;

      // Valid: primitive value types
      const valid = schema.safeParse( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: 'string', confidence: 0.9 },
          { value: 42, confidence: 0.8 },
          { value: true, confidence: 0.7 }
        ]
      } );
      expect( valid.success ).toBe( true );

      // Invalid: non-primitive value type in dimensions
      const invalid = schema.safeParse( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: { object: 'not allowed' }, confidence: 0.9 }
        ]
      } );
      expect( invalid.success ).toBe( false );
    } );
  } );

  describe( 'new fields: name, dimensions, feedback', () => {
    it( 'accepts optional name field', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        name: 'test-evaluation'
      } );
      expect( result.name ).toBe( 'test-evaluation' );
    } );

    it( 'name defaults to undefined when not provided', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8
      } );
      expect( result.name ).toBeUndefined();
    } );

    it( 'validates name must be string if provided', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        name: 123
      } ) ).toThrow( ValidationError );
    } );

    it( 'accepts dimensions array with EvaluationResult instances', () => {
      const dim1 = new EvaluationStringResult( { value: 'dim1', confidence: 0.9 } );
      const dim2 = new EvaluationNumberResult( { value: 42, confidence: 0.8 } );
      const result = new EvaluationResult( {
        value: 'main',
        confidence: 0.7,
        dimensions: [ dim1, dim2 ]
      } );
      expect( result.dimensions ).toHaveLength( 2 );
      expect( result.dimensions[0] ).toBe( dim1 );
      expect( result.dimensions[1] ).toBe( dim2 );
    } );

    it( 'dimensions defaults to empty array when not provided', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8
      } );
      expect( result.dimensions ).toEqual( [] );
    } );

    it( 'validates dimensions must match subclass schema', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [ { invalid: 'object' } ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'validates dimensions array structure', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: 'valid', confidence: 0.9 },
          { invalid: 'missing confidence' }
        ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'accepts dimensions with all three subclass types', () => {
      const result = new EvaluationResult( {
        value: 'main',
        confidence: 0.7,
        dimensions: [
          new EvaluationStringResult( { value: 'string-dim', confidence: 0.9 } ),
          new EvaluationNumberResult( { value: 42, confidence: 0.8 } ),
          new EvaluationBooleanResult( { value: true, confidence: 0.7 } )
        ]
      } );
      expect( result.dimensions ).toHaveLength( 3 );
      expect( result.dimensions[0] ).toBeInstanceOf( EvaluationStringResult );
      expect( result.dimensions[1] ).toBeInstanceOf( EvaluationNumberResult );
      expect( result.dimensions[2] ).toBeInstanceOf( EvaluationBooleanResult );
    } );

    it( 'accepts plain objects matching subclass schemas in dimensions', () => {
      const result = new EvaluationResult( {
        value: 'main',
        confidence: 0.7,
        dimensions: [
          { value: 'string-dim', confidence: 0.9 },
          { value: 42, confidence: 0.8 },
          { value: true, confidence: 0.7 }
        ]
      } );
      expect( result.dimensions ).toHaveLength( 3 );
      expect( result.dimensions[0].value ).toBe( 'string-dim' );
      expect( result.dimensions[1].value ).toBe( 42 );
      expect( result.dimensions[2].value ).toBe( true );
    } );

    it( 'accepts string dimension value type', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: 'string-value', confidence: 0.9 }
        ]
      } );
      expect( result.dimensions[0].value ).toBe( 'string-value' );
    } );

    it( 'accepts number dimension value type', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: 123, confidence: 0.9 }
        ]
      } );
      expect( result.dimensions[0].value ).toBe( 123 );
    } );

    it( 'accepts boolean dimension value type', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: true, confidence: 0.9 }
        ]
      } );
      expect( result.dimensions[0].value ).toBe( true );
    } );

    it( 'rejects dimensions with non-primitive value types', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: { object: 'not allowed' }, confidence: 0.9 }
        ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'rejects dimensions with array value types', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        dimensions: [
          { value: [ 1, 2, 3 ], confidence: 0.9 }
        ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'accepts nested dimensions (recursive)', () => {
      const nestedDim = new EvaluationStringResult( {
        value: 'nested',
        confidence: 0.9,
        dimensions: [
          new EvaluationNumberResult( { value: 10, confidence: 0.8 } )
        ]
      } );
      const result = new EvaluationResult( {
        value: 'main',
        confidence: 0.7,
        dimensions: [ nestedDim ]
      } );
      expect( result.dimensions ).toHaveLength( 1 );
      expect( result.dimensions[0].dimensions ).toHaveLength( 1 );
      expect( result.dimensions[0].dimensions[0].value ).toBe( 10 );
    } );

    it( 'accepts nested dimensions with plain objects', () => {
      const result = new EvaluationResult( {
        value: 'main',
        confidence: 0.7,
        dimensions: [
          {
            value: 'nested',
            confidence: 0.9,
            dimensions: [
              { value: 10, confidence: 0.8 }
            ]
          }
        ]
      } );
      expect( result.dimensions ).toHaveLength( 1 );
      expect( result.dimensions[0].dimensions ).toHaveLength( 1 );
      expect( result.dimensions[0].dimensions[0].value ).toBe( 10 );
    } );

    it( 'accepts feedback array with EvaluationFeedback instances', () => {
      const feedback1 = new EvaluationFeedback( {
        issue: 'Issue 1',
        suggestion: 'Fix this',
        priority: 'high'
      } );
      const feedback2 = new EvaluationFeedback( {
        issue: 'Issue 2',
        reference: 'ref-123'
      } );
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        feedback: [ feedback1, feedback2 ]
      } );
      expect( result.feedback ).toHaveLength( 2 );
      expect( result.feedback[0] ).toBe( feedback1 );
      expect( result.feedback[1] ).toBe( feedback2 );
    } );

    it( 'accepts feedback array with plain objects matching schema', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        feedback: [
          { issue: 'Issue 1', suggestion: 'Fix', priority: 'high' },
          { issue: 'Issue 2', reference: 'ref-123' }
        ]
      } );
      expect( result.feedback ).toHaveLength( 2 );
      expect( result.feedback[0].issue ).toBe( 'Issue 1' );
      expect( result.feedback[1].issue ).toBe( 'Issue 2' );
    } );

    it( 'feedback defaults to empty array when not provided', () => {
      const result = new EvaluationResult( {
        value: 'test',
        confidence: 0.8
      } );
      expect( result.feedback ).toEqual( [] );
    } );

    it( 'validates feedback must match EvaluationFeedback schema', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        feedback: [ { invalid: 'object' } ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'validates feedback issue is required', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        feedback: [ { suggestion: 'missing issue' } ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'validates feedback priority enum values', () => {
      expect( () => new EvaluationResult( {
        value: 'test',
        confidence: 0.8,
        feedback: [ { issue: 'test', priority: 'invalid' } ]
      } ) ).toThrow( ValidationError );
    } );

    it( 'accepts all new fields together', () => {
      const dim = new EvaluationStringResult( { value: 'dim', confidence: 0.9 } );
      const feedback = new EvaluationFeedback( { issue: 'test issue', priority: 'medium' } );
      const result = new EvaluationResult( {
        value: 'main',
        confidence: 0.8,
        name: 'comprehensive-test',
        dimensions: [ dim ],
        feedback: [ feedback ],
        reasoning: 'test reasoning'
      } );
      expect( result.name ).toBe( 'comprehensive-test' );
      expect( result.dimensions ).toHaveLength( 1 );
      expect( result.feedback ).toHaveLength( 1 );
      expect( result.reasoning ).toBe( 'test reasoning' );
    } );
  } );
} );

describe( 'interface/evaluator - EvaluationFeedback class', () => {
  describe( 'constructor', () => {
    it( 'creates feedback with required issue', () => {
      const feedback = new EvaluationFeedback( { issue: 'Test issue' } );
      expect( feedback.issue ).toBe( 'Test issue' );
      expect( feedback.suggestion ).toBeUndefined();
      expect( feedback.reference ).toBeUndefined();
      expect( feedback.priority ).toBeUndefined();
    } );

    it( 'creates feedback with all fields', () => {
      const feedback = new EvaluationFeedback( {
        issue: 'Critical bug',
        suggestion: 'Fix immediately',
        reference: 'BUG-123',
        priority: 'critical'
      } );
      expect( feedback.issue ).toBe( 'Critical bug' );
      expect( feedback.suggestion ).toBe( 'Fix immediately' );
      expect( feedback.reference ).toBe( 'BUG-123' );
      expect( feedback.priority ).toBe( 'critical' );
    } );

    it( 'accepts optional fields', () => {
      const feedback = new EvaluationFeedback( {
        issue: 'Minor issue',
        suggestion: 'Consider fixing'
      } );
      expect( feedback.issue ).toBe( 'Minor issue' );
      expect( feedback.suggestion ).toBe( 'Consider fixing' );
      expect( feedback.reference ).toBeUndefined();
      expect( feedback.priority ).toBeUndefined();
    } );
  } );

  describe( 'static schema getter', () => {
    it( 'validates required issue field', () => {
      const ok = EvaluationFeedback.schema.safeParse( { issue: 'Test issue' } );
      expect( ok.success ).toBe( true );

      const bad = EvaluationFeedback.schema.safeParse( {} );
      expect( bad.success ).toBe( false );
    } );

    it( 'validates issue must be string', () => {
      const bad = EvaluationFeedback.schema.safeParse( { issue: 123 } );
      expect( bad.success ).toBe( false );
    } );

    it( 'accepts optional suggestion field', () => {
      const ok = EvaluationFeedback.schema.safeParse( {
        issue: 'Test',
        suggestion: 'Fix it'
      } );
      expect( ok.success ).toBe( true );
    } );

    it( 'validates suggestion must be string if provided', () => {
      const bad = EvaluationFeedback.schema.safeParse( {
        issue: 'Test',
        suggestion: 123
      } );
      expect( bad.success ).toBe( false );
    } );

    it( 'accepts optional reference field', () => {
      const ok = EvaluationFeedback.schema.safeParse( {
        issue: 'Test',
        reference: 'REF-123'
      } );
      expect( ok.success ).toBe( true );
    } );

    it( 'validates reference must be string if provided', () => {
      const bad = EvaluationFeedback.schema.safeParse( {
        issue: 'Test',
        reference: 123
      } );
      expect( bad.success ).toBe( false );
    } );

    it( 'accepts valid priority enum values', () => {
      const priorities = [ 'low', 'medium', 'high', 'critical' ];
      for ( const priority of priorities ) {
        const ok = EvaluationFeedback.schema.safeParse( {
          issue: 'Test',
          priority
        } );
        expect( ok.success ).toBe( true );
      }
    } );

    it( 'rejects invalid priority values', () => {
      const bad = EvaluationFeedback.schema.safeParse( {
        issue: 'Test',
        priority: 'invalid'
      } );
      expect( bad.success ).toBe( false );
    } );

    it( 'validates priority must be string if provided', () => {
      const bad = EvaluationFeedback.schema.safeParse( {
        issue: 'Test',
        priority: 123
      } );
      expect( bad.success ).toBe( false );
    } );

    it( 'accepts all fields together', () => {
      const ok = EvaluationFeedback.schema.safeParse( {
        issue: 'Critical bug',
        suggestion: 'Fix immediately',
        reference: 'BUG-123',
        priority: 'critical'
      } );
      expect( ok.success ).toBe( true );
    } );
  } );
} );

