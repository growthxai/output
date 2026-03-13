import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Args, Command, Flags, ux } from '@oclif/core';
import { postWorkflowRun } from '#api/generated/api.js';
import type { PostWorkflowRun200 } from '#api/generated/api.js';
import {
  writeDataset,
  resolveDefaultDatasetsDir,
  buildDataset,
  getExecutionTime,
  extractDatasetName
} from '#services/datasets.js';
import { listRemoteTraces, downloadRemoteTrace } from '#services/s3_trace_downloader.js';
import { extractDatasetFromTrace } from '#utils/trace_extractor.js';
import { resolveScenarioPath, getScenarioNotFoundMessage } from '#utils/scenario_resolver.js';
import { parseInputFlag } from '#utils/input_parser.js';
import { handleApiError } from '#utils/error_handler.js';

export default class DatasetGenerate extends Command {
  static override description = 'Generate a dataset for a workflow from a scenario, trace file, or S3';

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple basic_input',
    '<%= config.bin %> <%= command.id %> simple --trace logs/runs/simple/trace.json --name edge_case',
    '<%= config.bin %> <%= command.id %> simple --download --limit 5'
  ];

  static override args = {
    workflowName: Args.string( {
      description: 'Name of the workflow',
      required: true
    } ),
    scenario: Args.string( {
      description: 'Scenario name (resolved from the workflow\'s scenarios/ directory)',
      required: false
    } )
  };

  static override flags = {
    trace: Flags.string( {
      char: 't',
      description: 'Path to a local trace file to extract dataset from',
      exclusive: [ 'download' ]
    } ),
    name: Flags.string( {
      char: 'n',
      description: 'Dataset name (defaults to scenario name or trace filename)'
    } ),
    download: Flags.boolean( {
      char: 'd',
      description: 'Download traces from S3 and create datasets',
      default: false,
      exclusive: [ 'trace' ]
    } ),
    limit: Flags.integer( {
      char: 'l',
      description: 'Maximum number of traces to download from S3',
      default: 5
    } ),
    input: Flags.string( {
      char: 'i',
      description: 'Workflow input as JSON string or file path (overrides scenario)'
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( DatasetGenerate );

    if ( flags.download ) {
      await this.generateFromS3( args.workflowName, flags.limit );
      return;
    }

    if ( flags.trace ) {
      await this.generateFromTrace(
        args.workflowName,
        flags.trace,
        flags.name
      );
      return;
    }

    await this.generateFromScenario(
      args.workflowName,
      args.scenario,
      flags.input,
      flags.name
    );
  }

  private async generateFromScenario(
    workflowName: string,
    scenario: string | undefined,
    inputFlag: string | undefined,
    nameOverride: string | undefined
  ): Promise<void> {
    const resolvedInput = await this.resolveScenarioInput(
      workflowName,
      scenario,
      inputFlag
    );

    const datasetName = nameOverride ?? scenario ?? 'dataset';

    this.log( `Running workflow "${workflowName}"...` );

    const response = await postWorkflowRun( {
      workflowName,
      input: resolvedInput
    }, {
      config: { timeout: 600000 }
    } );

    if ( !response?.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const { workflowId, output } = response.data as PostWorkflowRun200;
    const executionTimeMs = await getExecutionTime( workflowId );

    const dataset = buildDataset(
      datasetName,
      resolvedInput as Record<string, unknown>,
      output,
      executionTimeMs
    );

    const dir = resolveDefaultDatasetsDir( workflowName );
    const filePath = join( dir, `${datasetName}.yml` );
    await writeDataset( dataset, filePath );

    this.log( `Dataset saved: ${filePath}` );
  }

  private async generateFromTrace(
    workflowName: string,
    tracePath: string,
    nameOverride: string | undefined
  ): Promise<void> {
    this.log( `Reading trace: ${tracePath}` );

    const content = await readFile( tracePath, 'utf-8' );
    const traceData = JSON.parse( content );
    const extracted = extractDatasetFromTrace( traceData );

    const datasetName = nameOverride ?? extractDatasetName( tracePath );

    const dataset = buildDataset(
      datasetName,
      extracted.input,
      extracted.output,
      extracted.executionTimeMs
    );

    const dir = resolveDefaultDatasetsDir( workflowName );
    const filePath = join( dir, `${datasetName}.yml` );
    await writeDataset( dataset, filePath );

    this.log( `Dataset saved: ${filePath}` );
  }

  private async generateFromS3(
    workflowName: string,
    limit: number
  ): Promise<void> {
    this.log( `Listing remote traces for "${workflowName}"...` );

    const traces = await listRemoteTraces( workflowName, { limit } );
    if ( traces.length === 0 ) {
      this.log( 'No remote traces found.' );
      return;
    }

    this.log( `Found ${traces.length} trace(s). Downloading...` );

    const dir = resolveDefaultDatasetsDir( workflowName );

    for ( const trace of traces ) {
      const traceData = await downloadRemoteTrace( trace.key );
      const extracted = extractDatasetFromTrace( traceData );

      const datasetName = extractDatasetName( trace.key );

      const dataset = buildDataset(
        datasetName,
        extracted.input,
        extracted.output,
        extracted.executionTimeMs
      );

      const filePath = join( dir, `${datasetName}.yml` );
      await writeDataset( dataset, filePath );
      this.log( `  Saved: ${filePath}` );
    }

    this.log( `\nGenerated ${traces.length} dataset(s)` );
  }

  private async resolveScenarioInput(
    workflowName: string,
    scenario: string | undefined,
    inputFlag: string | undefined
  ): Promise<unknown> {
    if ( inputFlag && scenario ) {
      return ux.error(
        'Cannot use both scenario argument and --input flag. Choose one.',
        { exit: 1 }
      );
    }

    if ( inputFlag ) {
      return parseInputFlag( inputFlag );
    }

    if ( scenario ) {
      const resolution = await resolveScenarioPath( workflowName, scenario );
      if ( !resolution.found ) {
        return ux.error(
          getScenarioNotFoundMessage( workflowName, scenario, resolution.searchedPaths ),
          { exit: 1 }
        );
      }
      return parseInputFlag( resolution.path! );
    }

    return ux.error(
      'Input required. Provide either:\n' +
      '  - A scenario: output workflow dataset generate <workflow> <scenario>\n' +
      '  - An input flag: output workflow dataset generate <workflow> --input <json>',
      { exit: 1 }
    );
  }

  async catch( error: Error ): Promise<void> {
    return handleApiError( error, ( ...args ) => this.error( ...args ), {
      404: 'Workflow not found. Check the workflow name.',
      500: 'Workflow execution failed.'
    } );
  }
}
