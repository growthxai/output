import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_FILE_NAMES = [ 'workflow.ts', 'workflow.js' ];
const SCENARIOS_DIR = 'scenarios';
const WORKFLOW_NAME_PATTERN = /name:\s*['"]([^'"]+)['"]/;

export interface WorkflowDirInfo {
  workflowId: string | undefined;
  scenarioNames: string[];
}

function safeReadFile( filePath: string ): string {
  try {
    return readFileSync( filePath, 'utf-8' );
  } catch {
    return '';
  }
}

function safeReadDir( dirPath: string ): string[] {
  try {
    return readdirSync( dirPath );
  } catch {
    return [];
  }
}

function parseWorkflowId( targetDir: string ): string | undefined {
  const workflowFile = WORKFLOW_FILE_NAMES
    .map( name => join( targetDir, name ) )
    .find( existsSync );

  const content = workflowFile ? safeReadFile( workflowFile ) : '';
  return WORKFLOW_NAME_PATTERN.exec( content )?.[1];
}

function listScenarioNames( targetDir: string ): string[] {
  return safeReadDir( join( targetDir, SCENARIOS_DIR ) )
    .filter( f => f.endsWith( '.json' ) )
    .map( f => f.replace( /\.json$/, '' ) );
}

export function parseWorkflowDir( targetDir: string ): WorkflowDirInfo {
  return {
    workflowId: parseWorkflowId( targetDir ),
    scenarioNames: listScenarioNames( targetDir )
  };
}
