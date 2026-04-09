import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_FILE_NAMES = [ 'workflow.ts', 'workflow.js' ];
const SCENARIOS_DIR = 'scenarios';
const WORKFLOW_NAME_PATTERN = /name:\s*['"]([^'"]+)['"]/;

export interface WorkflowDirInfo {
  workflowId: string | undefined;
  scenarioNames: string[];
}

function readWorkflowName( filePath: string ): string | undefined {
  const content = readFileSync( filePath, 'utf-8' );
  const match = WORKFLOW_NAME_PATTERN.exec( content );
  return match?.[1];
}

function parseWorkflowId( targetDir: string ): string | undefined {
  const workflowFile = WORKFLOW_FILE_NAMES
    .map( name => join( targetDir, name ) )
    .find( existsSync );

  return workflowFile ? readWorkflowName( workflowFile ) : undefined;
}

function listScenarioNames( targetDir: string ): string[] {
  const scenariosDir = join( targetDir, SCENARIOS_DIR );
  if ( !existsSync( scenariosDir ) ) {
    return [];
  }

  return readdirSync( scenariosDir )
    .filter( f => f.endsWith( '.json' ) )
    .map( f => f.replace( /\.json$/, '' ) );
}

export function parseWorkflowDir( targetDir: string ): WorkflowDirInfo {
  return {
    workflowId: parseWorkflowId( targetDir ),
    scenarioNames: listScenarioNames( targetDir )
  };
}
