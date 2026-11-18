import { describe, it, expect } from 'vitest';
import {
  camelCase,
  pascalCase,
  processTemplate,
  prepareTemplateVariables
} from './template.js';

describe( 'Template Utilities', () => {

  describe( 'pascalCase', () => {
    it( 'should convert kebab-case to PascalCase', () => {
      expect( pascalCase( 'my-workflow-name' ) ).toBe( 'MyWorkflowName' );
    } );

    it( 'should convert snake_case to PascalCase', () => {
      expect( pascalCase( 'my_workflow_name' ) ).toBe( 'MyWorkflowName' );
    } );

    it( 'should handle single word', () => {
      expect( pascalCase( 'workflow' ) ).toBe( 'Workflow' );
    } );

    it( 'should handle mixed separators', () => {
      expect( pascalCase( 'my-workflow_name' ) ).toBe( 'MyWorkflowName' );
    } );
  } );

  describe( 'camelCase', () => {
    it( 'should convert kebab-case to camelCase', () => {
      expect( camelCase( 'my-workflow-name' ) ).toBe( 'myWorkflowName' );
    } );

    it( 'should convert snake_case to camelCase', () => {
      expect( camelCase( 'my_workflow_name' ) ).toBe( 'myWorkflowName' );
    } );

    it( 'should handle single word', () => {
      expect( camelCase( 'workflow' ) ).toBe( 'workflow' );
    } );
  } );

  describe( 'processTemplate', () => {
    it( 'should replace single variable', () => {
      const template = 'Hello {{name}}!';
      const variables = { name: 'World' };
      expect( processTemplate( template, variables ) ).toBe( 'Hello World!' );
    } );

    it( 'should replace multiple variables', () => {
      const template = 'Workflow {{workflowName}} - {{description}}';
      const variables = {
        workflowName: 'myWorkflow',
        description: 'A test workflow'
      };
      expect( processTemplate( template, variables ) )
        .toBe( 'Workflow myWorkflow - A test workflow' );
    } );

    it( 'should replace multiple occurrences of same variable', () => {
      const template = '{{name}} says hello to {{name}}';
      const variables = { name: 'Alice' };
      expect( processTemplate( template, variables ) )
        .toBe( 'Alice says hello to Alice' );
    } );

    it( 'should use Handlebars helpers for case transformations', () => {
      const template = '{{camelCase name}} and {{pascalCase name}}';
      const variables = { name: 'my-workflow-name' };
      expect( processTemplate( template, variables ) )
        .toBe( 'myWorkflowName and MyWorkflowName' );
    } );

    it( 'should preserve escaped curly braces for Liquid.js examples', () => {
      const template = 'Use Liquid: \\{{ variable }} and {% if %}...{% endif %}';
      const variables = {};
      expect( processTemplate( template, variables ) )
        .toBe( 'Use Liquid: {{ variable }} and {% if %}...{% endif %}' );
    } );
  } );

  describe( 'prepareTemplateVariables', () => {
    it( 'should prepare variables from workflow name and description', () => {
      const variables = prepareTemplateVariables(
        'my-test-workflow',
        'A test workflow for testing'
      );

      expect( variables ).toEqual( {
        workflowName: 'myTestWorkflow',
        WorkflowName: 'MyTestWorkflow',
        description: 'A test workflow for testing'
      } );
    } );

    it( 'should provide default description if not provided', () => {
      const variables = prepareTemplateVariables( 'test-workflow', '' );

      expect( variables.description ).toBe( 'A test-workflow workflow' );
    } );
  } );

} );

