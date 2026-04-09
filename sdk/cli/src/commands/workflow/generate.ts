import { Args, Command, Flags, ux } from '@oclif/core';
import { generateWorkflow } from '#services/workflow_generator.js';
import { buildWorkflow, buildWorkflowInteractiveLoop } from '#services/workflow_builder.js';
import { ensureOutputAISystem } from '#services/coding_agents.js';
import { getWorkflowGenerateSuccessMessage } from '#services/messages.js';
import { DEFAULT_OUTPUT_DIRS } from '#utils/paths.js';
import type { WorkflowGenerationResult } from '#types/generator.js';
import path from 'node:path';
import * as fsSync from 'node:fs';
import { getErrorMessage } from '#utils/error_utils.js';

export default class Generate extends Command {
  static override description = 'Generate a new Output workflow from a skeleton or plan file';

  static override examples = [
    '<%= config.bin %> <%= command.id %> my-workflow --skeleton',
    '<%= config.bin %> <%= command.id %> my-workflow --skeleton --description "Process and transform data"',
    '<%= config.bin %> <%= command.id %> my-workflow --plan-file .outputai/plans/2025_10_09_my_workflow/PLAN.md',
    '<%= config.bin %> <%= command.id %> my-workflow --skeleton --output-dir ./custom/path'
  ];

  static override flags = {
    skeleton: Flags.boolean( {
      char: 's',
      description: 'Generate minimal skeleton workflow without example steps',
      default: false
    } ),
    description: Flags.string( {
      char: 'd',
      description: 'Description of the workflow',
      required: false
    } ),
    'output-dir': Flags.string( {
      char: 'o',
      description: 'Output directory for the workflow',
      default: DEFAULT_OUTPUT_DIRS.workflows
    } ),
    force: Flags.boolean( {
      char: 'f',
      description: 'Overwrite existing directory',
      default: false
    } ),
    'plan-file': Flags.string( {
      char: 'p',
      description: 'Path to plan file for AI-assisted workflow implementation',
      required: false
    } )
  };

  static override args = {
    name: Args.string( {
      required: true,
      description: 'Name of the workflow to generate'
    } )
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse( Generate );
    const planFile = flags['plan-file'];

    if ( !flags.skeleton && !planFile ) {
      this.error( 'Full workflow generation not implemented yet. Please use --skeleton flag or --plan-file' );
    }

    const projectRoot = process.cwd();
    const absolutePlanPath = planFile ? path.resolve( projectRoot, planFile ) : '';

    if ( planFile && !fsSync.existsSync( absolutePlanPath ) ) {
      this.error( `Plan file not found: ${absolutePlanPath}` );
    }

    const result = await generateWorkflow( {
      name: args.name,
      description: flags.description,
      outputDir: flags['output-dir'],
      skeleton: flags.skeleton,
      force: flags.force
    } ).catch( ( error: unknown ): never => {
      this.error( getErrorMessage( error ) );
    } );

    if ( planFile ) {
      this.log( '\nStarting AI-assisted workflow implementation...\n' );

      await ensureOutputAISystem( projectRoot );

      const buildOutput = await buildWorkflow( absolutePlanPath, result.targetDir, args.name )
        .catch( ( error: unknown ): never => {
          fsSync.rmSync( result.targetDir, { recursive: true, force: true } );
          const message = getErrorMessage( error );
          this.error( `Workflow implementation failed, created files have been rolled back: ${message}` );
        } );

      await buildWorkflowInteractiveLoop( buildOutput );

      this.log( ux.colorize( 'green', '\nWorkflow implementation complete!\n' ) );
    }

    this.displaySuccess( result );
  }

  private displaySuccess( result: WorkflowGenerationResult ): void {
    const message = getWorkflowGenerateSuccessMessage(
      result.workflowName,
      result.workflowId,
      result.scenarioNames[0],
      result.targetDir,
      result.filesCreated
    );
    this.log( message );
  }
}
