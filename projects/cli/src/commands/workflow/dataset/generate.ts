import { Args, Command, Flags, ux } from '@oclif/core';
import { postWorkflowRun } from '#api/generated/api.js';
import type { WorkflowResultResponse } from '#api/generated/api.js';
import {
  writeDataset,
  resolveDefaultDatasetsDir,
  buildDataset,
  datasetFilePath
} from '#services/datasets.js';
import { createTemporalClient } from '#services/temporal_client.js';
import { collectWorkflowRunData, type WorkflowRunData } from '#services/workflow_run_data.js';
import { temporalFlags, type TemporalFlags } from '#utils/temporal_flags.js';
import { resolveScenarioPath, getScenarioNotFoundMessage } from '#utils/scenario_resolver.js';
import { parseInputFlag } from '#utils/input_parser.js';
import { createErrorFn, handleCommandError } from '#utils/error_handler.js';

export default class DatasetGenerate extends Command {
  static override description = 'Generate a dataset case for a workflow from a scenario, an input, or a completed run read from Temporal';

  static override examples = [
    '<%= config.bin %> <%= command.id %> simple basic_input',
    '<%= config.bin %> <%= command.id %> simple --input \'{"values":[1,2,3]}\' --name edge_case',
    '<%= config.bin %> <%= command.id %> simple --workflow-id wf-12345 --name edge_case',
    '<%= config.bin %> <%= command.id %> simple --workflow-id wf-12345 --run-id 11111111-2222-4333-8444-555555555555 --profile prod'
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
    name: Flags.string( {
      char: 'n',
      description: 'Dataset name (defaults to the scenario name, or the workflow id with --workflow-id)'
    } ),
    input: Flags.string( {
      char: 'i',
      description: 'Workflow input as JSON string or file path (overrides scenario)'
    } ),
    'workflow-id': Flags.string( {
      description: 'Workflow id of a completed run to read from Temporal (not the workflow type)',
      exclusive: [ 'input' ]
    } ),
    'run-id': Flags.string( {
      char: 'r',
      description: 'Run to read (defaults to the latest run of the workflow id)',
      dependsOn: [ 'workflow-id' ]
    } ),
    ...temporalFlags
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( DatasetGenerate );

    if ( flags['workflow-id'] !== undefined ) {
      if ( !flags['workflow-id'].trim() ) {
        this.error( '--workflow-id cannot be empty.', { exit: 1 } );
      }
      if ( args.scenario ) {
        this.error( 'Cannot use both scenario argument and --workflow-id flag. Choose one.', { exit: 1 } );
      }
      await this.generateFromWorkflowRun( args.workflowName, flags['workflow-id'], flags['run-id'], flags.name, flags );
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

    const { output } = response.data as WorkflowResultResponse;

    const dataset = buildDataset(
      datasetName,
      resolvedInput as Record<string, unknown>,
      output
    );

    const dir = await resolveDefaultDatasetsDir( workflowName );
    const filePath = datasetFilePath( dir, datasetName );
    await writeDataset( dataset, filePath );

    this.log( `Dataset saved: ${filePath}` );
  }

  private async generateFromWorkflowRun(
    workflowName: string,
    workflowId: string,
    runId: string | undefined,
    nameOverride: string | undefined,
    temporal: TemporalFlags
  ): Promise<void> {
    this.log( `Reading workflow "${workflowId}" from Temporal...` );

    const data = await this.readWorkflowRun( workflowName, workflowId, runId, temporal );

    const datasetName = nameOverride ?? workflowId;
    const dataset = buildDataset( datasetName, data.input, data.output );

    const dir = await resolveDefaultDatasetsDir( workflowName );
    const filePath = datasetFilePath( dir, datasetName );
    await writeDataset( dataset, filePath );

    this.log( `Dataset saved: ${filePath}` );
  }

  /** Reads the run from Temporal and reports any failure by its message alone, as `workflow debug` does */
  private async readWorkflowRun(
    workflowName: string,
    workflowId: string,
    runId: string | undefined,
    temporal: TemporalFlags
  ): Promise<WorkflowRunData> {
    try {
      const { client, close } = await createTemporalClient( temporal );
      return await collectWorkflowRunData( client, { workflowName, workflowId, runId } ).finally( close );
    } catch ( error ) {
      return this.error( error instanceof Error ? error.message : String( error ), { exit: 1 } );
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
    return handleCommandError( error, createErrorFn( this ), {
      404: 'Workflow not found. Check the workflow name.',
      500: 'Workflow execution failed.'
    } );
  }
}
