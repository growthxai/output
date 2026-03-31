/**
 * Claude Agent SDK client for workflow planning
 */
import { Options, query, SDKMessage, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import { ux } from '@oclif/core';
import * as cliProgress from 'cli-progress';
import type { Todo, SystemValidation } from '#types/domain.js';
import { getErrorMessage, toError } from '#utils/error_utils.js';
import { config } from '#config.js';

export const ADDITIONAL_INSTRUCTIONS = {
  PLAN: `
! IMPORTANT !
1. Use TodoWrite to track your progress through plan creation.

2. Please respond with only the final version of the plan content.

3. Respond in a markdown format with these metadata headers:

---
title: <plan-title>
description: <plan-description>
date: <plan-date>
---

<plan-content>

4. After you mark all todos as complete, you must respond with the final version of the plan.

5. DO NOT write the plan to disk — the CLI will handle saving the file to the plans directory.

6. DO NOT suggest any next steps, follow-up commands, or instructions for the user — the CLI will inform the user of next steps after saving.
`,
  BUILD: `
! IMPORTANT !
1. Use TodoWrite to track your progress through workflow implementation.

2. Follow the implementation plan exactly as specified in the plan file.

3. Implement all workflow files following Output.ai patterns and best practices.

4. After you mark all todos as complete, provide a summary of what was implemented.
`
} as const;

const PLAN_COMMAND = 'outputai:plan_workflow';
const BUILD_COMMAND = 'outputai:build_workflow';

const GLOBAL_CLAUDE_OPTIONS: Options = {
  settingSources: [ 'user', 'project', 'local' ]
};

export const PLAN_COMMAND_OPTIONS: Options = {
  allowedTools: [ 'Read', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite' ]
};

interface ReplyToClaudeOptions {
  anthropicOpts?: Options;
  applyAdditionalInstructions?: string;
}

export const BUILD_COMMAND_OPTIONS: Options = {
  permissionMode: 'bypassPermissions'
};

interface ToolUseMessage {
  type: 'tool_use';
  id: string;
  name: string;
  input: object;
}

interface TodoWriteMessage extends ToolUseMessage {
  name: 'TodoWrite';
  input: {
    todos: Todo[];
  };
}

export class ClaudeInvocationError extends Error {
  constructor( message: string, public cause?: Error ) {
    super( message );
    this.name = 'ClaudeInvocationError';
  }
}

function validateEnvironment(): void {
  if ( !process.env.ANTHROPIC_API_KEY ) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      '\n' +
      'Please set it using one of these methods:\n' +
      '1. Add it to a .env file in your project root:\n' +
      '   ANTHROPIC_API_KEY=your-api-key\n' +
      '\n' +
      '2. Export it in your shell:\n' +
      '   export ANTHROPIC_API_KEY=your-api-key\n' +
      '\n' +
      '3. Set it when running the command:\n' +
      '   ANTHROPIC_API_KEY=your-api-key output workflow plan\n' +
      '\n' +
      'Get your API key from: https://console.anthropic.com/'
    );
  }
}

function validateSystem( systemMessage: SDKSystemMessage ): SystemValidation {
  const requiredCommands = [ PLAN_COMMAND, BUILD_COMMAND ];
  const availableCommands = systemMessage.slash_commands;
  const missingCommands = requiredCommands.filter( command => !availableCommands.includes( command ) );

  return {
    missingCommands,
    hasIssues: missingCommands.length > 0
  };
}

function displaySystemValidationWarnings( validation: SystemValidation ): void {
  if ( !validation.hasIssues ) {
    return;
  }

  validation.missingCommands.forEach( command => {
    ux.warn( `Missing required claude-code slash command: /${command}` );
  } );

  ux.warn( 'Your claude-code agent is missing key configurations, it may not behave as expected.' );
  ux.warn( 'Please run "npx output update --agents" to fix this.' );
}

function applyDefaultOptions( options: Options ): Options {
  return {
    ...GLOBAL_CLAUDE_OPTIONS,
    ...options
  };
}

function getTodoWriteMessage( message: SDKMessage ): TodoWriteMessage | null {
  if ( message.type !== 'assistant' ) {
    return null;
  }

  const todoWriteMessage = message.message.content.find( ( c: ToolUseMessage ) => c?.type === 'tool_use' && c.name === 'TodoWrite' );

  return todoWriteMessage ?? null;
}

function applyInstructions( message: string, instructions: string ): string {
  return `${message}\n\n${instructions}`;
}

interface ProgressUpdate {
  message: string;
  completed: number;
  total: number;
}

function createProgressBar(): cliProgress.SingleBar {
  return new cliProgress.SingleBar( {
    format: '{bar} | {message} ({percentage}%)',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    barsize: 40,
    fps: 10,
    stopOnComplete: false
  } );
}

function calculateProgress(
  completedCount: number,
  totalCount: number
): number {
  if ( totalCount === 0 ) {
    return 0;
  }

  const percentage = ( ( completedCount + 1 ) / ( totalCount + 1 ) ) * 100;
  return Math.round( percentage * 10 ) / 10;
}

function getProgressUpdate( message: SDKMessage ): ProgressUpdate | null {
  const todoWriteMessage = getTodoWriteMessage( message );
  if ( !todoWriteMessage ) {
    return null;
  }

  const allTodos = todoWriteMessage.input.todos;
  const inProgressTodo = allTodos.find( t => t.status === 'in_progress' );

  if ( !inProgressTodo?.content ) {
    return null;
  }

  const completedTodos = allTodos.filter( t => t.status === 'completed' );

  return {
    message: `${inProgressTodo.content}...`,
    completed: completedTodos.length,
    total: allTodos.length
  };
}

function debugMessage( message: SDKMessage ): void {
  if ( !config.debugMode ) {
    return;
  }

  ux.stdout( ux.colorize( 'teal', `[Message]: ${message.type}` ) );
  ux.stdout( ux.colorize( 'teal', `[JSON]: ${JSON.stringify( message, null, 2 )}` ) );
}

async function singleQuery( prompt: string, options: Options = {} ) {
  validateEnvironment();
  const progressBar = createProgressBar();
  progressBar.start( 100, 0, { message: 'Thinking...' } );

  try {
    for await ( const message of query( {
      prompt,
      options: applyDefaultOptions( options )
    } ) ) {
      debugMessage( message );
      if ( message.type === 'system' && message.subtype === 'init' ) {
        const validation = validateSystem( message );
        displaySystemValidationWarnings( validation );
        progressBar.update( 1, { message: 'Diving in...' } );
      }

      const progressUpdate = getProgressUpdate( message );
      if ( progressUpdate ) {
        const percentage = calculateProgress(
          progressUpdate.completed,
          progressUpdate.total
        );
        progressBar.update( percentage, { message: progressUpdate.message } );
      }

      if ( message.type === 'result' && message.subtype === 'success' ) {
        progressBar.update( 100, { message: 'Complete!' } );
        progressBar.stop();
        return message.result;
      }
    }
    throw new Error( 'No output received from claude-code' );
  } catch ( error ) {
    progressBar.stop();
    throw new ClaudeInvocationError(
      `Failed to invoke claude-code: ${getErrorMessage( error )}`,
      toError( error )
    );
  }
}

export async function replyToClaude(
  message: string,
  { anthropicOpts, applyAdditionalInstructions = ADDITIONAL_INSTRUCTIONS.PLAN }: ReplyToClaudeOptions = {}
) {
  return singleQuery( applyInstructions( message, applyAdditionalInstructions ), { continue: true, ...anthropicOpts } );
}

/**
 * Invoke claude-code with /outputai:plan_workflow slash command
 * The SDK loads custom commands from .claude/commands/ when settingSources includes 'project'.
 * ensureOutputAISystem() scaffolds the command files to that location.
 * @param description - Workflow description
 * @returns Plan output from claude-code
 */
export async function invokePlanWorkflow(
  description: string
): Promise<string> {
  return singleQuery( applyInstructions( `/${PLAN_COMMAND} ${description}`, ADDITIONAL_INSTRUCTIONS.PLAN ), PLAN_COMMAND_OPTIONS );
}

/**
 * Invoke claude-code with /outputai:build_workflow slash command
 * The SDK loads custom commands from .claude/commands/ when settingSources includes 'project'.
 * ensureOutputAISystem() scaffolds the command files to that location.
 * @param planFilePath - Absolute path to the plan file
 * @param workflowDir - Absolute path to the workflow directory
 * @param workflowName - Name of the workflow
 * @param additionalInstructions - Optional additional instructions
 * @returns Implementation output from claude-code
 */
export async function invokeBuildWorkflow(
  planFilePath: string,
  workflowDir: string,
  workflowName: string,
  additionalInstructions?: string
): Promise<string> {
  const commandArgs = `${planFilePath} ${workflowName} ${workflowDir}`;
  const fullCommand = additionalInstructions ?
    `/${BUILD_COMMAND} ${commandArgs} ${additionalInstructions}` :
    `/${BUILD_COMMAND} ${commandArgs}`;

  return singleQuery( applyInstructions( fullCommand, ADDITIONAL_INSTRUCTIONS.BUILD ), BUILD_COMMAND_OPTIONS );
}
