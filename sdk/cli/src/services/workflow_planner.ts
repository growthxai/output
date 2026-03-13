import { initializeAgentConfig } from './coding_agents.js';
import { generateText } from '@outputai/llm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '#config.js';

export async function generatePlanName(
  description: string,
  date: Date = new Date()
): Promise<string> {
  const year = date.getFullYear();
  const month = String( date.getMonth() + 1 ).padStart( 2, '0' );
  const day = String( date.getDate() ).padStart( 2, '0' );
  const datePrefix = `${year}_${month}_${day}`;

  const { text: planNameSlug } = await generateText( {
    prompt: 'generate_plan_name@v1',
    variables: { description }
  } );

  const cleanedName = planNameSlug
    .trim()
    .toLowerCase()
    .replace( /[^a-z0-9_]+/g, '_' )
    .replace( /_+/g, '_' )
    .replace( /^_|_$/g, '' )
    .slice( 0, 50 );

  return `${datePrefix}_${cleanedName}`;
}

/**
 * Write plan content to PLAN.md file in the plans directory
 * @param planName - Name of the plan (e.g., "2025_10_06_customer_order_processing")
 * @param content - Plan content to write
 * @param projectRoot - Root directory of the project
 * @returns Full path to the created PLAN.md file
 */
export async function writePlanFile(
  planName: string,
  content: string,
  projectRoot: string
): Promise<string> {
  const planDir = path.join( projectRoot, config.agentConfigDir, 'plans', planName );
  const planFilePath = path.join( planDir, 'PLAN.md' );

  await fs.mkdir( planDir, { recursive: true } );
  await fs.writeFile( planFilePath, content, 'utf-8' );

  return planFilePath;
}

/**
 * Update agent templates by reinitializing with force flag
 * This recreates all agent configuration files, overwriting existing ones
 * @param projectRoot - Root directory of the project
 */
export async function updateAgentTemplates( projectRoot: string ): Promise<void> {
  await initializeAgentConfig( {
    projectRoot,
    force: true
  } );
}
