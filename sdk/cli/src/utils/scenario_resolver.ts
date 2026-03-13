import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getWorkflowCatalog, type GetWorkflowCatalog200 } from '#api/generated/api.js';

const SCENARIOS_DIR = 'scenarios';
const WORKFLOWS_PATHS = [ 'src/workflows', 'workflows' ];

export interface ScenarioResolutionResult {
  found: boolean;
  path?: string;
  searchedPaths: string[];
}

export function extractWorkflowRelativePath( path: string ): string | null {
  const match = path.match( /workflows\/(.+)\/workflow\.[jt]s$/ );
  return match ? match[1] : null;
}

async function fetchWorkflowDirectory( workflowName: string ): Promise<string | null> {
  try {
    const response = await getWorkflowCatalog();
    const data = response?.data as GetWorkflowCatalog200 | undefined;
    const workflows = data?.workflows;
    if ( !workflows ) {
      return null;
    }

    const workflow = workflows.find( w => w.name === workflowName );
    if ( !workflow ) {
      return null;
    }

    const workflowPath = workflow.path;
    if ( !workflowPath ) {
      return null;
    }

    return extractWorkflowRelativePath( workflowPath );
  } catch {
    return null;
  }
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

export async function resolveScenarioPath(
  workflowName: string,
  scenarioName: string,
  basePath: string = process.cwd()
): Promise<ScenarioResolutionResult> {
  const scenarioFileName = scenarioName.endsWith( '.json' ) ?
    scenarioName :
    `${scenarioName}.json`;

  const catalogDir = await fetchWorkflowDirectory( workflowName );

  if ( catalogDir ) {
    const result = resolveScenarioFromDirectory( catalogDir, scenarioFileName, basePath );
    if ( result.found ) {
      return result;
    }

    // Catalog resolved but scenario not found at that path — still try convention fallback
    // in case the catalog path differs from local source layout
    if ( catalogDir !== workflowName ) {
      const fallback = resolveScenarioFromDirectory( workflowName, scenarioFileName, basePath );
      return {
        found: fallback.found,
        path: fallback.path,
        searchedPaths: [ ...result.searchedPaths, ...fallback.searchedPaths ]
      };
    }

    return result;
  }

  // API unavailable or workflow not in catalog — fall back to convention
  return resolveScenarioFromDirectory( workflowName, scenarioFileName, basePath );
}

export function listScenariosForWorkflow(
  workflowName: string,
  workflowPath?: string,
  basePath: string = process.cwd()
): string[] {
  const relativeDir = ( workflowPath && extractWorkflowRelativePath( workflowPath ) ) || workflowName;

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
