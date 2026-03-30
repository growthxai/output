import * as fs from 'node:fs/promises';
import { WorkflowExistsError } from '#types/errors.js';
import type { WorkflowGenerationConfig, WorkflowGenerationResult } from '#types/generator.js';
import { createTargetDir, getTemplateDir } from '#utils/paths.js';
import { validateWorkflowName, validateOutputDirectory } from '#utils/validation.js';
import { prepareTemplateVariables } from '#utils/template.js';
import { getTemplateFiles, processAllTemplates } from './template_processor.js';

/**
 * Validate the generation configuration
 */
function validateConfig( config: WorkflowGenerationConfig ): void {
  validateWorkflowName( config.name );
  validateOutputDirectory( config.outputDir );
}

/**
 * Check if target directory exists and handle accordingly
 */
import * as fsSync from 'node:fs';

async function checkTargetDirectory( targetDir: string, force: boolean ): Promise<void> {
  if ( fsSync.existsSync( targetDir ) && !force ) {
    throw new WorkflowExistsError( config.name, targetDir );
  }
}

/**
 * Generate a new workflow
 */
export async function generateWorkflow( config: WorkflowGenerationConfig ): Promise<WorkflowGenerationResult> {
  validateConfig( config );

  const targetDir = createTargetDir( config.outputDir, config.name );
  const templatesDir = getTemplateDir( 'workflow' );

  await checkTargetDirectory( targetDir, config.force );
  await fs.mkdir( targetDir, { recursive: true } );

  const variables = prepareTemplateVariables( config.name, config.description || '' );
  const templateFiles = await getTemplateFiles( templatesDir );

  const filesCreated = await processAllTemplates(
    templateFiles,
    targetDir,
    variables
  );

  return {
    workflowName: config.name,
    targetDir,
    filesCreated
  };
}
