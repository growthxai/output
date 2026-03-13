import Handlebars from 'handlebars';
import { camelCase, pascalCase } from 'change-case';

/**
 * Create a Handlebars compiler with custom helpers
 */
function createCompiler(): typeof Handlebars {
  const compiler = Handlebars.create();

  compiler.registerHelper( 'camelCase', ( str: string ) => camelCase( str ) );
  compiler.registerHelper( 'pascalCase', ( str: string ) => pascalCase( str ) );

  return compiler;
}

/**
 * Process a template string with variables
 */
export function processTemplate(
  templateContent: string,
  variables: Record<string, string>
): string {
  const compiler = createCompiler();
  const template = compiler.compile( templateContent );
  return template( variables );
}

/**
 * Prepare template variables from workflow name and description
 */
export function prepareTemplateVariables(
  workflowName: string,
  description: string
): Record<string, string> {
  return {
    workflowName: camelCase( workflowName ),
    WorkflowName: pascalCase( workflowName ),
    description: description || `A ${workflowName} workflow`
  };
}

export { camelCase, pascalCase } from 'change-case';
