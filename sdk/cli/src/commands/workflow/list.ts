import { Command, Flags } from '@oclif/core';
import Table from 'cli-table3';
import { getWorkflowCatalog, type GetWorkflowCatalog200, type Workflow } from '#api/generated/api.js';
import { parseWorkflowDefinition, formatParameters } from '#api/parser.js';
import { handleApiError } from '#utils/error_handler.js';
import { listScenariosForWorkflow } from '#utils/scenario_resolver.js';

const OUTPUT_FORMAT = {
  LIST: 'list',
  TABLE: 'table',
  JSON: 'json'
} as const;

type OutputFormat = typeof OUTPUT_FORMAT[keyof typeof OUTPUT_FORMAT];

interface WorkflowDisplay {
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  scenarios: string;
  aliases: string;
}

export function parseWorkflowForDisplay( workflow: Workflow ): WorkflowDisplay {
  const parsed = parseWorkflowDefinition( workflow );
  const scenarioNames = listScenariosForWorkflow( workflow.name, workflow.path );
  return {
    name: parsed.name,
    description: parsed.description || 'No description',
    inputs: formatParameters( parsed.inputs ),
    outputs: formatParameters( parsed.outputs ),
    scenarios: scenarioNames.length > 0 ? scenarioNames.join( ', ' ) : 'none',
    aliases: workflow.aliases?.length ? workflow.aliases.join( ', ' ) : 'none'
  };
}

function caseInsensitiveIncludes( str: string, filter: string ): boolean {
  return str.toLowerCase().includes( filter.toLowerCase() );
}

function matchName( filterString: string ): ( workflow: Workflow ) => boolean {
  return workflow => {
    const name = workflow.name || '';
    if ( caseInsensitiveIncludes( name, filterString ) ) {
      return true;
    }
    return ( workflow.aliases ?? [] ).some( alias => caseInsensitiveIncludes( alias, filterString ) );
  };
}

function sortWorkflowsByName( workflows: Workflow[] ): Workflow[] {
  return [ ...workflows ].sort( ( a, b ) => {
    const nameA = ( a.name || '' ).toLowerCase();
    const nameB = ( b.name || '' ).toLowerCase();
    return nameA.localeCompare( nameB );
  } );
}

function createWorkflowTable( workflows: Workflow[], detailed: boolean ): string {
  const table = new Table( {
    head: [ 'Name', 'Description', 'Aliases', 'Inputs', 'Outputs', 'Scenarios' ],
    colWidths: detailed ? [ 28, 36, 36, 36, 36, 48 ] : [ 22, 26, 26, 22, 22, 36 ],
    wordWrap: true,
    style: {
      head: [ 'cyan' ]
    }
  } );

  const sortedWorkflows = sortWorkflowsByName( workflows );

  sortedWorkflows.forEach( workflow => {
    const display = parseWorkflowForDisplay( workflow );

    if ( detailed ) {
      const aliases = display.aliases.split( ', ' ).join( '\n' );
      const inputs = display.inputs.split( ', ' ).join( '\n' );
      const outputs = display.outputs.split( ', ' ).join( '\n' );
      const scenarios = display.scenarios.split( ', ' ).join( '\n' );
      table.push( [ display.name, display.description, aliases, inputs, outputs, scenarios ] );
    } else {
      table.push( [ display.name, display.description, display.aliases, display.inputs, display.outputs, display.scenarios ] );
    }
  } );

  return table.toString();
}

function formatWorkflowsAsList( workflows: Workflow[] ): string {
  const sortedWorkflows = sortWorkflowsByName( workflows );
  const names = sortedWorkflows.map( w => parseWorkflowForDisplay( w ).name );

  return `\nWorkflows:\n\n${names.map( name => `- ${name}` ).join( '\n' )}`;
}

function formatWorkflowsAsJson( workflows: Workflow[] ): string {
  const output = {
    workflows: workflows.map( w => {
      const display = parseWorkflowForDisplay( w );
      return {
        name: display.name,
        description: display.description,
        aliases: display.aliases === 'none' ? [] : display.aliases.split( ', ' ),
        inputs: display.inputs.split( ', ' ),
        outputs: display.outputs.split( ', ' ),
        scenarios: display.scenarios === 'none' ? [] : display.scenarios.split( ', ' ),
        raw: w
      };
    } )
  };

  return JSON.stringify( output, null, 2 );
}

function formatWorkflows( workflows: Workflow[], format: OutputFormat, detailed: boolean ): string {
  if ( format === OUTPUT_FORMAT.JSON ) {
    return formatWorkflowsAsJson( workflows );
  }
  if ( format === OUTPUT_FORMAT.TABLE ) {
    return createWorkflowTable( workflows, detailed );
  }
  return formatWorkflowsAsList( workflows );
}

export default class WorkflowList extends Command {
  static override description = 'List available workflows from the catalog';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --format table',
    '<%= config.bin %> <%= command.id %> --format json',
    '<%= config.bin %> <%= command.id %> --detailed',
    '<%= config.bin %> <%= command.id %> --filter simple'
  ];

  static override flags = {
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OUTPUT_FORMAT.LIST, OUTPUT_FORMAT.TABLE, OUTPUT_FORMAT.JSON ],
      default: OUTPUT_FORMAT.LIST
    } ),
    detailed: Flags.boolean( {
      char: 'd',
      description: 'Show detailed parameter information',
      default: false
    } ),
    filter: Flags.string( {
      description: 'Filter workflows by name'
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( WorkflowList );

    this.log( 'Fetching workflow catalog...' );
    const response = await getWorkflowCatalog();

    if ( !response ) {
      this.error( 'Failed to connect to API server. Is it running?', { exit: 1 } );
    }

    if ( !response.data ) {
      this.error( 'API returned invalid response (missing data)', { exit: 1 } );
    }

    const data = response.data as GetWorkflowCatalog200;
    if ( !data.workflows ) {
      this.error( 'API returned invalid response (missing workflows)', { exit: 1 } );
    }

    if ( data.workflows.length === 0 ) {
      this.log( 'No workflows found in catalog.' );
      return;
    }

    const workflows = flags.filter ?
      data.workflows.filter( matchName( flags.filter ) ) :
      data.workflows;

    if ( workflows.length === 0 && flags.filter ) {
      this.log( `No workflows matching filter: ${flags.filter}` );
      return;
    }

    const output = formatWorkflows( workflows, flags.format as OutputFormat, flags.detailed );

    this.log( output );
    this.log( `\nFound ${workflows.length} workflow(s)` );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Catalog not found.'
    } );
  }
}
