import { describe, it, expect } from 'vitest';
import { getEvalWorkflowName } from './eval_naming.js';

describe( 'naming', () => {
  describe( 'getEvalWorkflowName', () => {
    it( 'appends _eval suffix', () => {
      expect( getEvalWorkflowName( 'simple' ) ).toBe( 'simple_eval' );
      expect( getEvalWorkflowName( 'my_workflow' ) ).toBe( 'my_workflow_eval' );
    } );
  } );
} );
