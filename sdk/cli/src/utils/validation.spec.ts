import { describe, expect, it } from 'vitest';
import { isValidWorkflowName } from './validation.js';

describe( 'isValidWorkflowName', () => {
  describe( 'valid workflow names', () => {
    it( 'should accept single letter', () => {
      expect( isValidWorkflowName( 'a' ) ).toBe( true );
      expect( isValidWorkflowName( 'Z' ) ).toBe( true );
    } );

    it( 'should accept single underscore', () => {
      expect( isValidWorkflowName( '_' ) ).toBe( true );
    } );

    it( 'should accept names starting with letter', () => {
      expect( isValidWorkflowName( 'workflow' ) ).toBe( true );
      expect( isValidWorkflowName( 'MyWorkflow' ) ).toBe( true );
      expect( isValidWorkflowName( 'simpleWorkflow123' ) ).toBe( true );
    } );

    it( 'should accept names starting with underscore', () => {
      expect( isValidWorkflowName( '_workflow' ) ).toBe( true );
      expect( isValidWorkflowName( '_private_workflow' ) ).toBe( true );
      expect( isValidWorkflowName( '__double_underscore' ) ).toBe( true );
    } );

    it( 'should accept names with numbers after first character', () => {
      expect( isValidWorkflowName( 'workflow1' ) ).toBe( true );
      expect( isValidWorkflowName( 'workflow_123' ) ).toBe( true );
      expect( isValidWorkflowName( 'a123456789' ) ).toBe( true );
      expect( isValidWorkflowName( '_123' ) ).toBe( true );
    } );

    it( 'should accept names with hyphens', () => {
      expect( isValidWorkflowName( 'my-workflow' ) ).toBe( true );
      expect( isValidWorkflowName( 'workflow-name' ) ).toBe( true );
      expect( isValidWorkflowName( 'workflow-' ) ).toBe( true );
      expect( isValidWorkflowName( 'my-workflow-name' ) ).toBe( true );
    } );

    it( 'should accept names with underscores in any position', () => {
      expect( isValidWorkflowName( 'my_workflow' ) ).toBe( true );
      expect( isValidWorkflowName( 'workflow_name_here' ) ).toBe( true );
      expect( isValidWorkflowName( 'a_b_c_d' ) ).toBe( true );
      expect( isValidWorkflowName( 'workflow__double' ) ).toBe( true );
    } );

    it( 'should accept mixed case names', () => {
      expect( isValidWorkflowName( 'WorkFlow' ) ).toBe( true );
      expect( isValidWorkflowName( 'myWorkFlow' ) ).toBe( true );
      expect( isValidWorkflowName( 'MY_WORKFLOW' ) ).toBe( true );
      expect( isValidWorkflowName( 'CamelCaseWorkflow' ) ).toBe( true );
    } );

    it( 'should accept long valid names', () => {
      const longName = 'a'.repeat( 100 ) + '_' + '1'.repeat( 100 );
      expect( isValidWorkflowName( longName ) ).toBe( true );
    } );
  } );

  describe( 'invalid workflow names', () => {
    it( 'should reject empty string', () => {
      expect( isValidWorkflowName( '' ) ).toBe( false );
    } );

    it( 'should reject names starting with numbers', () => {
      expect( isValidWorkflowName( '1workflow' ) ).toBe( false );
      expect( isValidWorkflowName( '123' ) ).toBe( false );
      expect( isValidWorkflowName( '0_workflow' ) ).toBe( false );
      expect( isValidWorkflowName( '9abc' ) ).toBe( false );
    } );

    it( 'should reject names starting with hyphens', () => {
      expect( isValidWorkflowName( '-workflow' ) ).toBe( false );
    } );

    it( 'should reject names with spaces', () => {
      expect( isValidWorkflowName( 'my workflow' ) ).toBe( false );
      expect( isValidWorkflowName( ' workflow' ) ).toBe( false );
      expect( isValidWorkflowName( 'workflow ' ) ).toBe( false );
      expect( isValidWorkflowName( 'work flow' ) ).toBe( false );
    } );

    it( 'should reject names with special characters', () => {
      expect( isValidWorkflowName( 'workflow!' ) ).toBe( false );
      expect( isValidWorkflowName( 'work@flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'workflow#123' ) ).toBe( false );
      expect( isValidWorkflowName( 'work$flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'workflow%' ) ).toBe( false );
      expect( isValidWorkflowName( 'work^flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'workflow&' ) ).toBe( false );
      expect( isValidWorkflowName( 'work*flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'workflow(' ) ).toBe( false );
      expect( isValidWorkflowName( 'work)flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work+flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work=flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work[flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work]flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work{flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work}flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work|flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work\\flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work/flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work:flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work;flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work"flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work\'flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work<flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work>flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work,flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work.flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work?flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work`flow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work~flow' ) ).toBe( false );
    } );

    it( 'should reject names with unicode characters', () => {
      expect( isValidWorkflowName( 'wørkflow' ) ).toBe( false );
      expect( isValidWorkflowName( 'работа' ) ).toBe( false );
      expect( isValidWorkflowName( '工作流' ) ).toBe( false );
      expect( isValidWorkflowName( 'workflow™' ) ).toBe( false );
      expect( isValidWorkflowName( 'work✓flow' ) ).toBe( false );
      expect( isValidWorkflowName( '😀workflow' ) ).toBe( false );
    } );

    it( 'should reject names with tabs and newlines', () => {
      expect( isValidWorkflowName( 'work\tflow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work\nflow' ) ).toBe( false );
      expect( isValidWorkflowName( 'work\rflow' ) ).toBe( false );
    } );

    it( 'should handle string versions of null and undefined', () => {
      // String(null) returns "null" which is actually a valid workflow name
      expect( isValidWorkflowName( String( null ) ) ).toBe( true );
      // String(undefined) returns "undefined" which is also a valid workflow name
      expect( isValidWorkflowName( String( undefined ) ) ).toBe( true );
    } );
  } );

  describe( 'edge cases', () => {
    it( 'should handle boundary conditions', () => {
      expect( isValidWorkflowName( 'a0' ) ).toBe( true );
      expect( isValidWorkflowName( '_0' ) ).toBe( true );
      expect( isValidWorkflowName( 'Z9' ) ).toBe( true );
      expect( isValidWorkflowName( '_9' ) ).toBe( true );
    } );

    it( 'should be case-insensitive for letters', () => {
      expect( isValidWorkflowName( 'abc' ) ).toBe( true );
      expect( isValidWorkflowName( 'ABC' ) ).toBe( true );
      expect( isValidWorkflowName( 'AbC' ) ).toBe( true );
    } );

    it( 'should handle only underscores and numbers after initial character', () => {
      expect( isValidWorkflowName( 'a_________' ) ).toBe( true );
      expect( isValidWorkflowName( '_000000000' ) ).toBe( true );
      expect( isValidWorkflowName( 'a_0_1_2_3' ) ).toBe( true );
    } );
  } );
} );
