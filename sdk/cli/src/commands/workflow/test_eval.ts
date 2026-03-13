import { join } from 'node:path';
import { Args, Command, Flags } from '@oclif/core';
import { postWorkflowRun } from '#api/generated/api.js';
import type { PostWorkflowRun200 } from '#api/generated/api.js';
import { readAllDatasets, writeDataset } from '#services/datasets.js';
import { handleApiError } from '#utils/error_handler.js';
import {
  getEvalWorkflowName,
  renderEvalOutput,
  computeExitCode,
  EvalOutputSchema
} from '@outputai/evals';
import type { Dataset, EvalOutput } from '@outputai/evals';

export default class WorkflowTest extends Command {
  static override aliases = [ 'workflow:test' ];

  static override description = 'Run evaluations against a workflow using its datasets';

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple',
    '<%= config.bin %> <%= command.id %> simple --cached',
    '<%= config.bin %> <%= command.id %> simple --save',
    '<%= config.bin %> <%= command.id %> simple --dataset basic_input,edge_case',
    '<%= config.bin %> <%= command.id %> simple --format json'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Name of the workflow to test',
      required: true
    } )
  };

  static override flags = {
    cached: Flags.boolean( {
      description: 'Use cached output from dataset files (skip workflow execution)',
      default: false,
      exclusive: [ 'save' ]
    } ),
    save: Flags.boolean( {
      description: 'Run workflow and save output back to dataset files',
      default: false,
      exclusive: [ 'cached' ]
    } ),
    dataset: Flags.string( {
      description: 'Comma-separated list of dataset names to run',
      char: 'd'
    } ),
    format: Flags.string( {
      char: 'f',
      description: 'Output format',
      options: [ 'json', 'text' ],
      default: 'text'
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( WorkflowTest );
    const filterNames = flags.dataset?.split( ',' ).map( s => s.trim() );

    const { datasets, dir } = await readAllDatasets( args.workflowName, filterNames );

    if ( datasets.length === 0 ) {
      this.error(
        `No datasets found for workflow "${args.workflowName}".\n` +
        'Generate datasets first: output workflow dataset generate',
        { exit: 1 }
      );
    }

    const preparedDatasets = flags.cached ?
      this.validateDatasets( datasets ) :
      await this.runWorkflowForDatasets( args.workflowName, datasets, flags.save, dir );

    const evalName = getEvalWorkflowName( args.workflowName );
    this.log( `Running eval workflow "${evalName}"...\n` );

    const response = await postWorkflowRun( {
      workflowName: evalName,
      input: { datasets: preparedDatasets }
    }, {
      config: { timeout: 600000 }
    } );

    const evalData = response?.data as PostWorkflowRun200 | undefined;
    if ( !evalData?.output ) {
      this.error( 'Eval workflow returned no output', { exit: 1 } );
    }

    const evalOutput: EvalOutput = EvalOutputSchema.parse( evalData.output );

    if ( flags.save ) {
      await this.saveEvalResults( evalOutput, preparedDatasets, dir );
    }

    if ( flags.format === 'json' ) {
      this.log( JSON.stringify( evalOutput, null, 2 ) );
    } else {
      this.log( renderEvalOutput( evalOutput, evalName ) );
    }

    const exitCode = computeExitCode( evalOutput );
    if ( exitCode !== 0 ) {
      this.exit( exitCode );
    }
  }

  private validateDatasets( datasets: Dataset[] ): Dataset[] {
    const missing = datasets.filter( d => d.last_output?.output === undefined );
    if ( missing.length > 0 ) {
      const names = missing.map( d => d.name ).join( ', ' );
      this.error(
        `Datasets missing cached output: ${names}\n` +
        'Run without --cached to execute the workflow, or use --save to cache output.',
        { exit: 1 }
      );
    }
    return datasets;
  }

  private async runWorkflowForDatasets(
    workflowName: string,
    datasets: Dataset[],
    save: boolean,
    dir: string
  ): Promise<Dataset[]> {
    this.log( `Running workflow "${workflowName}" for ${datasets.length} dataset(s)...\n` );

    const results: Dataset[] = [];

    for ( const dataset of datasets ) {
      this.log( `  Running "${dataset.name}"...` );

      const startMs = Date.now();
      const response = await postWorkflowRun( {
        workflowName,
        input: dataset.input
      }, {
        config: { timeout: 600000 }
      } );
      const executionTimeMs = Date.now() - startMs;

      if ( !response?.data ) {
        this.error( `Workflow execution failed for dataset "${dataset.name}"`, { exit: 1 } );
      }

      const updated: Dataset = {
        ...dataset,
        last_output: {
          output: ( response.data as PostWorkflowRun200 ).output,
          executionTimeMs,
          date: new Date().toISOString()
        }
      };

      if ( save ) {
        const filePath = join( dir, `${dataset.name}.yml` );
        await writeDataset( updated, filePath );
        this.log( `    Saved output to ${filePath}` );
      }

      results.push( updated );
    }

    this.log( '' );
    return results;
  }

  private async saveEvalResults(
    evalOutput: EvalOutput,
    datasets: Dataset[],
    dir: string
  ): Promise<void> {
    const now = new Date().toISOString();

    for ( const evalCase of evalOutput.cases ) {
      const dataset = datasets.find( d => d.name === evalCase.datasetName );
      if ( !dataset ) {
        continue;
      }

      const updated: Dataset = {
        ...dataset,
        last_eval: {
          output: evalCase,
          date: now
        }
      };

      const filePath = join( dir, `${dataset.name}.yml` );
      await writeDataset( updated, filePath );
      this.log( `  Saved eval result to ${filePath}` );
    }
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow or eval workflow not found. Check the workflow name.',
      500: 'Workflow execution failed.'
    } );
  }
}
