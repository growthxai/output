import { readFile } from 'node:fs/promises';
import { Args, Command, Flags, ux } from '@oclif/core';
import { postWorkflowRun } from '#api/generated/api.js';
import type { WorkflowResultResponse } from '#api/generated/api.js';
import {
  writeDataset,
  resolveDefaultDatasetsDir,
  buildDataset,
  getExecutionTime,
  extractDatasetName,
  datasetFilePath
} from '#services/datasets.js';
import { fetchWorkflowRuns } from '#services/workflow_runs.js';
import { getTrace } from '#services/trace_reader.js';
import { extractDatasetFromTrace } from '#utils/trace_extractor.js';
import { resolveScenarioPath, getScenarioNotFoundMessage } from '#utils/scenario_resolver.js';
import { parseInputFlag } from '#utils/input_parser.js';
import { handleApiError } from '#utils/error_handler.js';

export default class DatasetGenerate extends Command {
  static override description = 'Generate a dataset for a workflow from a scenario, trace file, or recent runs';

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
    catalog: Flags.string( {
      char: 'c',
      aliases: [ 'task-queue' ],
      charAliases: [ 'q' ],
      deprecateAliases: true,
      description: 'Catalog name for workflow execution (defaults to OUTPUT_CATALOG_ID)',
      env: 'OUTPUT_CATALOG_ID'
    } ),
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
      description: 'Generate datasets from recent workflow runs fetched via the Output API',
      default: false,
      exclusive: [ 'trace' ]
    } ),
    limit: Flags.integer( {
      char: 'l',
      description: 'Maximum number of recent runs to fetch',
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
      await this.generateFromRuns( args.workflowName, flags.limit, flags.catalog );
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
      flags.name,
      flags.catalog
    );
  }

  private async generateFromScenario(
    workflowName: string,
    scenario: string | undefined,
    inputFlag: string | undefined,
    nameOverride: string | undefined,
    catalog: string | undefined
  ): Promise<void> {
    const resolvedInput = await this.resolveScenarioInput(
      workflowName,
      scenario,
      inputFlag,
      catalog
    );

    const datasetName = nameOverride ?? scenario ?? 'dataset';

    this.log( `Running workflow "${workflowName}"...` );

    const response = await postWorkflowRun( {
      workflowName,
      input: resolvedInput,
      catalog
    }, {
      config: { timeout: 600000 }
    } );

    if ( !response?.data ) {
      this.error( 'API returned invalid response', { exit: 1 } );
    }

    const { workflowId, output } = response.data as WorkflowResultResponse;
    const executionTimeMs = await getExecutionTime( workflowId );

    const dataset = buildDataset(
      datasetName,
      resolvedInput as Record<string, unknown>,
      output,
      executionTimeMs
    );

    const dir = await resolveDefaultDatasetsDir( workflowName );
    const filePath = datasetFilePath( dir, datasetName );
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

    const dir = await resolveDefaultDatasetsDir( workflowName );
    const filePath = datasetFilePath( dir, datasetName );
    await writeDataset( dataset, filePath );

    this.log( `Dataset saved: ${filePath}` );
  }

  private async generateFromRuns(
    workflowName: string,
    limit: number,
    catalog: string | undefined
  ): Promise<void> {
    this.log( `Fetching recent runs for "${workflowName}"...` );

    const { runs } = await fetchWorkflowRuns( { workflowType: workflowName, catalog, limit } );
    if ( runs.length === 0 ) {
      this.log( 'No recent runs found.' );
      return;
    }

    const ids = runs
      .map( run => run.workflowId )
      .filter( ( id ): id is string => Boolean( id ) );

    const missing = runs.length - ids.length;
    if ( missing > 0 ) {
      this.warn( `Skipping ${missing} run(s) with no workflow ID.` );
    }

    // The trace-log endpoint always targets a workflow's latest run, so distinct
    // runIds sharing one workflowId (continue-as-new, reset) collapse to one dataset.
    const workflowIds = [ ...new Set( ids ) ];
    if ( workflowIds.length === 0 ) {
      this.error( `Found ${runs.length} run(s) but none had a workflow ID.`, { exit: 1 } );
    }

    this.log( `Found ${workflowIds.length} run(s). Fetching traces...` );

    const dir = await resolveDefaultDatasetsDir( workflowName );

    const outcomes = await Promise.all( workflowIds.map( id => this.generateFromRun( id, dir ) ) );
    const generated = outcomes.filter( Boolean ).length;
    this.log( `\nGenerated ${generated} dataset(s)` );

    if ( generated === 0 ) {
      this.error( `Failed to generate any datasets from ${workflowIds.length} run(s).`, { exit: 1 } );
    }
  }

  private async generateFromRun( workflowId: string, dir: string ): Promise<boolean> {
    try {
      const { data: traceData } = await getTrace( workflowId );
      const extracted = extractDatasetFromTrace( traceData );

      const dataset = buildDataset(
        workflowId,
        extracted.input,
        extracted.output,
        extracted.executionTimeMs
      );

      const filePath = datasetFilePath( dir, workflowId );
      await writeDataset( dataset, filePath );
      this.log( `  Saved: ${filePath}` );
      return true;
    } catch ( error ) {
      const message = error instanceof Error ? error.message : String( error );
      this.warn( `  Skipped ${workflowId}: ${message}` );
      return false;
    }
  }

  private async resolveScenarioInput(
    workflowName: string,
    scenario: string | undefined,
    inputFlag: string | undefined,
    catalog: string | undefined
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
      const resolution = await resolveScenarioPath( workflowName, scenario, undefined, undefined, catalog );
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
