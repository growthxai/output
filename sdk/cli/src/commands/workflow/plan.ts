import { Command, Flags, ux } from '@oclif/core';
import { input } from '@inquirer/prompts';
import {
  generatePlanName,
  updateAgentTemplates,
  writePlanFile
} from '#services/workflow_planner.js';
import { ensureOutputAISystem } from '#services/coding_agents.js';
import { invokePlanWorkflow, PLAN_COMMAND_OPTIONS, replyToClaude } from '#services/claude_client.js';

export default class WorkflowPlan extends Command {
  static description = 'Generate a workflow plan from a description';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --description "A workflow to take a question and answer it"',
    '<%= config.bin %> <%= command.id %> --force-agent-file-write'
  ];

  static flags = {
    'force-agent-file-write': Flags.boolean( {
      description: 'Force overwrite of agent template files',
      default: false
    } ),
    description: Flags.string( {
      char: 'd',
      description: 'Workflow description',
      required: false
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( WorkflowPlan );
    const projectRoot = process.cwd();

    this.log( 'Checking .outputai directory structure...' );
    await ensureOutputAISystem( projectRoot );

    if ( flags['force-agent-file-write'] ) {
      this.log( 'Updating agent templates...' );
      await updateAgentTemplates( projectRoot );
      this.log( 'Templates updated successfully\n' );
    }

    const description = flags.description ?? await input( {
      message: 'Describe the workflow you want to create:',
      validate: ( value: string ) => value.length >= 10
    } );

    this.log( '\nGenerating plan name...' );
    const planName = await generatePlanName( description );
    this.log( `Plan name: ${planName}` );

    await this.planGenerationLoop( description, planName, projectRoot );

  }

  private async planModificationLoop(
    originalPlanContent: string
  ): Promise<string> {
    const acceptKey = 'ACCEPT';

    this.log( '=========' );
    this.log( originalPlanContent );
    this.log( '=========' );

    const modifications = await input( {
      message: ux.colorize( 'gray', `Reply or type ${acceptKey} to accept the plan as is: ` ),
      validate: ( value: string ) => value.length >= 10 || value === acceptKey
    } );

    if ( modifications === acceptKey ) {
      return originalPlanContent;
    }

    const modifiedPlanContent = await replyToClaude( modifications, PLAN_COMMAND_OPTIONS );
    return this.planModificationLoop( modifiedPlanContent );
  }

  private async planGenerationLoop(
    promptDescription: string,
    planName: string,
    projectRoot: string
  ): Promise<void> {
    this.log( '\nInvoking the /outputai:plan_workflow command...' );
    this.log( 'This may take a moment...\n' );

    const planContent = await invokePlanWorkflow( promptDescription );
    const modifiedPlanContent = await this.planModificationLoop( planContent );
    const modifiedSavedPath = await writePlanFile( planName, modifiedPlanContent, projectRoot );
    this.log( `✅ Plan saved to: ${modifiedSavedPath}\n` );
    const generateCmd = ux.colorize( 'cyan', `npx output workflow generate <WORKFLOW_NAME> --plan-file=${modifiedSavedPath}` );
    this.log( `⏭️  To execute this plan run: ${generateCmd}` );
  }
}
