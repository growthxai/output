import { Args, Command, Flags } from '@oclif/core';
import Table from 'cli-table3';
import { listDatasets } from '#services/datasets.js';
import type { DatasetInfo } from '#services/datasets.js';

const OutputFormat = {
  TABLE: 'table',
  JSON: 'json',
  TEXT: 'text'
} as const;

type OutputFormatValue = typeof OutputFormat[keyof typeof OutputFormat];

function createDatasetsTable( datasets: DatasetInfo[] ): string {
  const table = new Table( {
    head: [ 'Name', 'Output Date', 'Eval Date', 'Has Output', 'Path' ],
    colWidths: [ 25, 22, 22, 16, 50 ],
    wordWrap: true,
    style: {
      head: [ 'cyan' ]
    }
  } );

  datasets.forEach( dataset => {
    table.push( [
      dataset.name,
      dataset.lastOutputDate ?? '-',
      dataset.lastEvalDate ?? '-',
      dataset.hasLastOutput ? 'Yes' : 'No',
      dataset.path
    ] );
  } );

  return table.toString();
}

function formatDatasetsAsText( datasets: DatasetInfo[] ): string {
  if ( datasets.length === 0 ) {
    return 'No datasets found.';
  }

  return datasets.map( dataset => {
    const cached = dataset.hasLastOutput ? '(cached)' : '(no output)';
    const outputDate = dataset.lastOutputDate ? ` [output: ${dataset.lastOutputDate}]` : '';
    const evalDate = dataset.lastEvalDate ? ` [eval: ${dataset.lastEvalDate}]` : '';
    return `${dataset.name} ${cached}${outputDate}${evalDate}`;
  } ).join( '\n' );
}

function formatDatasetsAsJson( datasets: DatasetInfo[] ): string {
  return JSON.stringify( datasets, null, 2 );
}

function formatDatasets( datasets: DatasetInfo[], format: OutputFormatValue ): string {
  if ( format === OutputFormat.JSON ) {
    return formatDatasetsAsJson( datasets );
  }
  if ( format === OutputFormat.TABLE ) {
    return createDatasetsTable( datasets );
  }
  return formatDatasetsAsText( datasets );
}

export default class DatasetList extends Command {
  static override description = 'List datasets for a workflow';

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple',
    '<%= config.bin %> <%= command.id %> simple --format json',
    '<%= config.bin %> <%= command.id %> simple --format table'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Workflow name to list datasets for',
      required: true
    } )
  };

  static override flags = {
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ OutputFormat.TABLE, OutputFormat.JSON, OutputFormat.TEXT ],
      default: OutputFormat.TABLE
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( DatasetList );

    const datasets = await listDatasets( args.workflowName );

    if ( datasets.length === 0 ) {
      this.log( `No datasets found for workflow "${args.workflowName}".` );
      this.log( 'Generate datasets with: output workflow dataset generate' );
      return;
    }

    const output = formatDatasets( datasets, flags.format as OutputFormatValue );
    this.log( output );

    if ( flags.format !== OutputFormat.JSON ) {
      this.log( `\nFound ${datasets.length} dataset(s) for "${args.workflowName}"` );
    }
  }
}
