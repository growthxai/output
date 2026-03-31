/**
 * Workflow builder service for implementing workflows from plan files
 */
import {
  ADDITIONAL_INSTRUCTIONS,
  BUILD_COMMAND_OPTIONS,
  invokeBuildWorkflow as invokeBuildWorkflowFromClient,
  replyToClaude
} from './claude_client.js';
import { input } from '@inquirer/prompts';
import { ux } from '@oclif/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getErrorMessage } from '#utils/error_utils.js';

const ACCEPT_KEY = 'ACCEPT';
const SEPARATOR_LINE = '─'.repeat( 80 );

function displayImplementationOutput( output: string, message: string ): void {
  ux.stdout( '\n' );
  ux.stdout( ux.colorize( 'green', message ) );
  ux.stdout( '\n' );
  ux.stdout( ux.colorize( 'dim', SEPARATOR_LINE ) );
  ux.stdout( output );
  ux.stdout( ux.colorize( 'dim', SEPARATOR_LINE ) );
  ux.stdout( '\n' );
}

async function promptForModification(): Promise<string> {
  return input( {
    message: `Review the implementation. Type "${ACCEPT_KEY}" to accept, or describe modifications:`,
    default: ACCEPT_KEY
  } );
}

function isAcceptCommand( modification: string ): boolean {
  return modification.trim().toUpperCase() === ACCEPT_KEY;
}

function isEmpty( modification: string ): boolean {
  return modification.trim() === '';
}

/**
 * Build a workflow from a plan file using the /outputai:build_workflow slash command
 * @param planFilePath - Absolute path to the plan file
 * @param workflowDir - Absolute path to the workflow directory
 * @param workflowName - Name of the workflow
 * @param additionalInstructions - Optional additional instructions
 * @returns Implementation output from claude-code
 */
export async function buildWorkflow(
  planFilePath: string,
  workflowDir: string,
  workflowName: string,
  additionalInstructions?: string
): Promise<string> {
  try {
    await fs.access( planFilePath );
  } catch {
    throw new Error( `Plan file not found: ${planFilePath}` );
  }

  await fs.mkdir( workflowDir, { recursive: true } );

  const absolutePlanPath = path.resolve( planFilePath );
  const absoluteWorkflowDir = path.resolve( workflowDir );

  return invokeBuildWorkflowFromClient(
    absolutePlanPath,
    absoluteWorkflowDir,
    workflowName,
    additionalInstructions
  );
}

async function processModification( modification: string, currentOutput: string ): Promise<string> {
  if ( isEmpty( modification ) ) {
    ux.stdout( ux.colorize( 'yellow', 'Please provide modification instructions or type ACCEPT to continue.' ) );
    return currentOutput;
  }

  try {
    const updatedOutput = await replyToClaude( modification, {
      anthropicOpts: BUILD_COMMAND_OPTIONS,
      applyAdditionalInstructions: ADDITIONAL_INSTRUCTIONS.BUILD
    } );
    displayImplementationOutput( updatedOutput, '✓ Implementation updated!' );
    return updatedOutput;
  } catch ( error ) {
    ux.stdout( ux.colorize( 'red', `Failed to apply modifications: ${getErrorMessage( error )}` ) );
    ux.stdout( 'Continuing with previous version...\n' );
    return currentOutput;
  }
}

async function interactiveRefinementLoop( currentOutput: string ): Promise<string> {
  const modification = await promptForModification();

  if ( isAcceptCommand( modification ) ) {
    return currentOutput;
  }

  const updatedOutput = await processModification( modification, currentOutput );
  return interactiveRefinementLoop( updatedOutput );
}

/**
 * Interactive loop for refining workflow implementation
 * Similar to the plan modification loop pattern
 * @param originalOutput - Initial implementation output from claude-code
 * @returns Final accepted output
 */
export async function buildWorkflowInteractiveLoop(
  originalOutput: string
): Promise<string> {
  displayImplementationOutput( originalOutput, '✓ Workflow implementation complete!' );
  return interactiveRefinementLoop( originalOutput );
}
