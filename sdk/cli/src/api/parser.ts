import { compileSchema, draft07 } from 'json-schema-library';
import type { Workflow, JSONSchema } from './generated/api.js';

interface WorkflowParameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface ParsedWorkflow {
  name: string;
  description?: string;
  inputs: WorkflowParameter[];
  outputs: WorkflowParameter[];
}

function formatType( schema: JSONSchema ): string {
  if ( !schema ) {
    return 'any';
  }

  if ( schema.type === 'array' ) {
    const itemsType = schema.items?.type || 'any';
    return `array<${itemsType}>`;
  }

  return schema.type || 'any';
}

function processProperties(
  properties: Record<string, JSONSchema>,
  prefix = '',
  requiredList: string[] = []
): WorkflowParameter[] {
  return Object.entries( properties ).flatMap( ( [ key, propSchema ] ) => {
    const prop = propSchema as JSONSchema;
    const propName = prefix ? `${prefix}.${key}` : key;

    if ( prop.type === 'object' && prop.properties ) {
      const nestedRequired = prop.required || [];
      return processProperties( prop.properties, propName, nestedRequired );
    }

    return {
      name: propName,
      type: formatType( prop ),
      required: requiredList.includes( key ),
      description: prop.description
    };
  } );
}

function extractParametersFromSchema( schema: JSONSchema | undefined ): WorkflowParameter[] {
  if ( !schema ) {
    return [];
  }

  const schemaNode = compileSchema( schema, { drafts: [ draft07 ] } );
  const compiledSchema = schemaNode.schema as JSONSchema;

  if ( compiledSchema.type === 'object' && compiledSchema.properties ) {
    const required = compiledSchema.required || [];
    return processProperties( compiledSchema.properties, '', required );
  }

  if ( compiledSchema.type ) {
    return [ {
      name: 'value',
      type: compiledSchema.type,
      required: true,
      description: compiledSchema.description
    } ];
  }

  return [];
}

export function parseWorkflowDefinition( workflow: Workflow ): ParsedWorkflow {
  return {
    name: workflow.name,
    description: workflow.description,
    inputs: extractParametersFromSchema( workflow.inputSchema ),
    outputs: extractParametersFromSchema( workflow.outputSchema )
  };
}

export function formatParameterType( param: WorkflowParameter ): string {
  const typeStr = param.type;
  const reqStr = param.required ? '' : '?';
  return `${typeStr}${reqStr}`;
}

export function formatParameters( params: WorkflowParameter[] ): string {
  if ( params.length === 0 ) {
    return 'none';
  }

  return params
    .map( p => `${p.name}: ${formatParameterType( p )}` )
    .join( ', ' );
}
