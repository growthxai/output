import { Command, Flags } from '@oclif/core';
import Table from 'cli-table3';
import { type Workflow } from '#api/generated/api.js';
import { fetchWorkflowCatalog } from '#api/workflow_catalog.js';
import { parseWorkflowDefinition, formatParameters } from '#api/parser.js';
import { handleApiError } from '#utils/error_handler.js';
import { listScenariosForWorkflow } from '#utils/scenario_resolver.js';

const OUTPUT_FORMAT = {
  LIST: 'list',
  TABLE: 'table'
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
      const aliases = workflow.aliases?.length ? workflow.aliases.join( '\n' ) : 'none';
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

function formatWorkflowAsListItem( workflow: Workflow ): string {
  const { name, aliases } = parseWorkflowForDisplay( workflow );
  return aliases === 'none' ? `- ${name}` : `- ${name} (aliases: ${aliases})`;
}

export function formatWorkflowsAsList( workflows: Workflow[] ): string {
  const lines = sortWorkflowsByName( workflows ).map( formatWorkflowAsListItem );

  return `\nWorkflows:\n\n${lines.join( '\n' )}`;
}

function formatWorkflowsAsJson( workflows: Workflow[] ): { workflows: unknown[] } {
  return {
    workflows: workflows.map( w => {
      const display = parseWorkflowForDisplay( w );
      return {
        name: display.name,
        description: display.description,
        aliases: w.aliases ?? [],
        inputs: display.inputs.split( ', ' ),
        outputs: display.outputs.split( ', ' ),
        scenarios: display.scenarios === 'none' ? [] : display.scenarios.split( ', ' ),
        raw: w
      };
    } )
  };
}

function formatWorkflows( workflows: Workflow[], format: OutputFormat, detailed: boolean ): string {
  if ( format === OUTPUT_FORMAT.TABLE ) {
    return createWorkflowTable( workflows, detailed );
  }
  return formatWorkflowsAsList( workflows );
}

export default class WorkflowList extends Command {
  static override description = 'List available workflows from the catalog';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --format table',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --detailed',
    '<%= config.bin %> <%= command.id %> --filter simple',
    '<%= config.bin %> <%= command.id %> --catalog my-catalog'
  ];

  static override flags = {
    catalog: Flags.string( {
      char: 'c',
      aliases: [ 'task-queue' ],
      charAliases: [ 'q' ],
      deprecateAliases: true,
      description: 'Catalog to list workflows from (defaults to OUTPUT_CATALOG_ID)',
      env: 'OUTPUT_CATALOG_ID'
    } ),
    format: Flags.string( {
      char: 'f',
      description: 'Output format (use --json for JSON output)',
      options: [ OUTPUT_FORMAT.LIST, OUTPUT_FORMAT.TABLE ],
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

  async run(): Promise<{ workflows: unknown[] }> {
    const { flags } = await this.parse( WorkflowList );

    this.log( flags.catalog ? `Fetching workflow catalog: ${flags.catalog}...` : 'Fetching workflow catalog...' );
    const catalogWorkflows = await fetchWorkflowCatalog( flags.catalog );

    const workflows = flags.filter ?
      catalogWorkflows.filter( matchName( flags.filter ) ) :
      catalogWorkflows;

    if ( catalogWorkflows.length === 0 ) {
      this.log( 'No workflows found in catalog.' );
    } else if ( workflows.length === 0 && flags.filter ) {
      this.log( `No workflows matching filter: ${flags.filter}` );
    } else {
      this.log( formatWorkflows( workflows, flags.format as OutputFormat, flags.detailed ) );
      this.log( `\nFound ${workflows.length} workflow(s)` );
    }

    return formatWorkflowsAsJson( workflows );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Catalog not found.'
    } );
  }
}
