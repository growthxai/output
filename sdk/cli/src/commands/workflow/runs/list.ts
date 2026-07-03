import { Args, Command, Flags } from '@oclif/core';
import Table from 'cli-table3';
import { fetchWorkflowRuns, type WorkflowRun } from '#services/workflow_runs.js';
import { formatDate, formatDurationFromTimestamps } from '#utils/date_formatter.js';
import { handleApiError } from '#utils/error_handler.js';

const OUTPUT_FORMAT = {
  TABLE: 'table',
  TEXT: 'text'
} as const;

type OutputFormat = typeof OUTPUT_FORMAT[keyof typeof OUTPUT_FORMAT];

function createRunsTable( runs: WorkflowRun[] ): string {
  const table = new Table( {
    head: [ 'Workflow ID', 'Type', 'Status', 'Started', 'Duration' ],
    colWidths: [ null, 20, 12, 22, 10 ],
    wordWrap: true,
    style: {
      head: [ 'cyan' ]
    }
  } );

  runs.forEach( run => {
    table.push( [
      run.workflowId,
      run.workflowType || '-',
      run.status || '-',
      formatDate( run.startedAt ),
      formatDurationFromTimestamps( run.startedAt || '', run.completedAt )
    ] );
  } );

  return table.toString();
}

function formatRunsAsText( runs: WorkflowRun[] ): string {
  if ( runs.length === 0 ) {
    return 'No workflow runs found.';
  }

  return runs.map( run => {
    const duration = formatDurationFromTimestamps( run.startedAt || '', run.completedAt );
    return `${run.workflowId} (${run.workflowType}) - ${run.status} [${duration}]`;
  } ).join( '\n' );
}

function formatRuns( runs: WorkflowRun[], format: OutputFormat ): string {
  if ( format === OUTPUT_FORMAT.TABLE ) {
    return createRunsTable( runs );
  }
  return formatRunsAsText( runs );
}

export default class WorkflowRunsList extends Command {
  static override description = 'List workflow runs with optional filtering by workflow type';

  static override enableJsonFlag = true;

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> simple',
    '<%= config.bin %> <%= command.id %> simple --limit 10',
    '<%= config.bin %> <%= command.id %> --catalog my-catalog',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --format table'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Filter by workflow type/name',
      required: false
    } )
  };

  static override flags = {
    catalog: Flags.string( {
      char: 'c',
      description: 'Filter runs by catalog (defaults to OUTPUT_CATALOG_ID)',
      env: 'OUTPUT_CATALOG_ID'
    } ),
    limit: Flags.integer( {
      char: 'l',
      description: 'Maximum number of runs to return',
      default: 100
    } ),
    format: Flags.string( {
      char: 'f',
      description: 'Output format (use --json for JSON output)',
      options: [ OUTPUT_FORMAT.TABLE, OUTPUT_FORMAT.TEXT ],
      default: OUTPUT_FORMAT.TABLE
    } )
  };

  async run(): Promise<WorkflowRun[]> {
    const { args, flags } = await this.parse( WorkflowRunsList );

    const { runs, skipped } = await fetchWorkflowRuns( {
      workflowType: args.workflowName,
      catalog: flags.catalog,
      limit: flags.limit
    } );

    if ( skipped > 0 ) {
      this.warn( `Skipping ${skipped} run(s) with no workflow ID.` );
    }

    if ( this.jsonEnabled() ) {
      return runs;
    }

    if ( runs.length === 0 ) {
      const filterMsg = args.workflowName ? ` for workflow type "${args.workflowName}"` : '';
      this.log( `No workflow runs found${filterMsg}.` );
      return runs;
    }

    const output = formatRuns( runs, flags.format as OutputFormat );
    this.log( output );

    const filterMsg = args.workflowName ? ` of type "${args.workflowName}"` : '';
    this.log( `\nFound ${runs.length} run(s)${filterMsg}` );

    return runs;
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      400: 'Invalid parameters provided.',
      503: 'Workflow service temporarily unavailable.'
    } );
  }
}
