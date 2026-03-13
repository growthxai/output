import { describe, it, expect } from 'vitest';
import { getEvalWorkflowName, isEvalWorkflow, getParentWorkflowName } from './naming.js';

describe( 'naming', () => {
  describe( 'getEvalWorkflowName', () => {
    it( 'appends _eval suffix', () => {
      expect( getEvalWorkflowName( 'simple' ) ).toBe( 'simple_eval' );
      expect( getEvalWorkflowName( 'my_workflow' ) ).toBe( 'my_workflow_eval' );
    } );
  } );

  describe( 'isEvalWorkflow', () => {
    it( 'returns true for names ending with _eval', () => {
      expect( isEvalWorkflow( 'simple_eval' ) ).toBe( true );
      expect( isEvalWorkflow( 'my_workflow_eval' ) ).toBe( true );
    } );

    it( 'returns false for regular workflow names', () => {
      expect( isEvalWorkflow( 'simple' ) ).toBe( false );
      expect( isEvalWorkflow( 'eval_runner' ) ).toBe( false );
      expect( isEvalWorkflow( 'evaluation' ) ).toBe( false );
    } );
  } );

  describe( 'getParentWorkflowName', () => {
    it( 'strips the _eval suffix', () => {
      expect( getParentWorkflowName( 'simple_eval' ) ).toBe( 'simple' );
      expect( getParentWorkflowName( 'my_workflow_eval' ) ).toBe( 'my_workflow' );
    } );

    it( 'returns empty string for bare _eval', () => {
      expect( getParentWorkflowName( '_eval' ) ).toBe( '' );
    } );
  } );
} );
