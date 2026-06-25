import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWorkflowsBasePath } from '#utils/paths.js';
import {
  WORKFLOWS_PATHS,
  candidateWorkflowDirsFromPath,
  fetchWorkflowPath
} from '#utils/workflow_dir.js';

export { extractWorkflowRelativePath, findWorkflowDirectoryFromPath } from '#utils/workflow_dir.js';

const SCENARIOS_DIR = 'scenarios';

export interface ScenarioResolutionResult {
  found: boolean;
  path?: string;
  searchedPaths: string[];
}

function candidateScenarioDirsFromPath( workflowPath: string, basePath: string ): string[] {
  return candidateWorkflowDirsFromPath( workflowPath, basePath )
    .map( workflowDir => resolve( workflowDir, SCENARIOS_DIR ) );
}

function resolveScenarioFromDirectory(
  relativeDir: string,
  scenarioFileName: string,
  basePath: string
): ScenarioResolutionResult {
  const searchedPaths: string[] = [];

  for ( const workflowsDir of WORKFLOWS_PATHS ) {
    const candidatePath = resolve(
      basePath,
      workflowsDir,
      relativeDir,
      SCENARIOS_DIR,
      scenarioFileName
    );
    searchedPaths.push( candidatePath );

    if ( existsSync( candidatePath ) ) {
      return { found: true, path: candidatePath, searchedPaths };
    }
  }

  return { found: false, searchedPaths };
}

function resolveScenarioFromScenarioDirs(
  scenariosDirs: string[],
  scenarioFileName: string
): ScenarioResolutionResult {
  const searchedPaths = scenariosDirs.map( dir => resolve( dir, scenarioFileName ) );
  const path = searchedPaths.find( existsSync );
  return path ?
    { found: true, path, searchedPaths } :
    { found: false, searchedPaths };
}

export async function resolveScenarioPath(
  workflowName: string,
  scenarioName: string,
  basePath: string = getWorkflowsBasePath(),
  workflowPath?: string,
  catalog?: string
): Promise<ScenarioResolutionResult> {
  const scenarioFileName = scenarioName.endsWith( '.json' ) ?
    scenarioName :
    `${scenarioName}.json`;

  if ( workflowPath ) {
    const pathResult = resolveScenarioFromScenarioDirs(
      candidateScenarioDirsFromPath( workflowPath, basePath ),
      scenarioFileName
    );
    if ( pathResult.found ) {
      return pathResult;
    }
  }

  const catalogPath = workflowPath ? null : await fetchWorkflowPath( workflowName, catalog );

  if ( catalogPath ) {
    const result = resolveScenarioFromScenarioDirs(
      candidateScenarioDirsFromPath( catalogPath, basePath ),
      scenarioFileName
    );
    if ( result.found ) {
      return result;
    }

    const fallback = resolveScenarioFromDirectory( workflowName, scenarioFileName, basePath );
    return {
      found: fallback.found,
      path: fallback.path,
      searchedPaths: [ ...result.searchedPaths, ...fallback.searchedPaths ]
    };
  }

  // API unavailable or workflow not in catalog — fall back to convention
  return resolveScenarioFromDirectory( workflowName, scenarioFileName, basePath );
}

export function listScenariosForWorkflow(
  workflowName: string,
  workflowPath?: string,
  basePath: string = getWorkflowsBasePath()
): string[] {
  const scenariosDirs = workflowPath ? candidateScenarioDirsFromPath( workflowPath, basePath ) : [];
  const scenariosDir = scenariosDirs.find( existsSync );
  if ( scenariosDir ) {
    return readdirSync( scenariosDir )
      .filter( f => f.endsWith( '.json' ) )
      .map( f => f.replace( /\.json$/, '' ) );
  }

  const relativeDir = workflowName;

  for ( const workflowsDir of WORKFLOWS_PATHS ) {
    const scenariosDir = resolve( basePath, workflowsDir, relativeDir, SCENARIOS_DIR );
    if ( existsSync( scenariosDir ) ) {
      return readdirSync( scenariosDir )
        .filter( f => f.endsWith( '.json' ) )
        .map( f => f.replace( /\.json$/, '' ) );
    }
  }

  return [];
}

export function getScenarioNotFoundMessage(
  workflowName: string,
  scenarioName: string,
  searchedPaths: string[]
): string {
  const pathsList = searchedPaths.map( p => `  - ${p}` ).join( '\n' );
  return [
    `Scenario '${scenarioName}' not found for workflow '${workflowName}'.`,
    '',
    'Searched in:',
    pathsList,
    '',
    'Tip: Create a scenario file in your workflow\'s scenarios/ directory.',
    '',
    'Or use --input to specify a custom path:',
    `  output workflow run ${workflowName} --input /path/to/input.json`
  ].join( '\n' );
}
