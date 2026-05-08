import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { findWorkflowDirectoryFromPath, resolveScenarioPath } from '#utils/scenario_resolver.js';
import { getWorkflowsBasePath } from '#utils/paths.js';

const WORKFLOWS_PATHS = [ 'src/workflows', 'workflows' ];

export const readScenario = async (
  workflowName: string,
  scenarioName: string,
  workflowPath?: string
): Promise<unknown> => {
  const resolution = await resolveScenarioPath( workflowName, scenarioName, getWorkflowsBasePath(), workflowPath );
  if ( !resolution.found || !resolution.path ) {
    throw new Error( `Scenario '${scenarioName}' not found for workflow '${workflowName}'.` );
  }
  const content = await readFile( resolution.path, 'utf-8' );
  return JSON.parse( content );
};

const findWorkflowDirectory = ( workflowName: string, workflowPath?: string ): string | null => {
  const basePath = getWorkflowsBasePath();
  const pathDir = findWorkflowDirectoryFromPath( workflowPath, basePath );
  if ( pathDir ) {
    return pathDir;
  }

  for ( const wfDir of WORKFLOWS_PATHS ) {
    const candidate = resolve( basePath, wfDir, workflowName );
    if ( existsSync( candidate ) ) {
      return candidate;
    }
  }
  return null;
};

export const writeScenario = async (
  workflowName: string,
  scenarioName: string,
  content: unknown,
  workflowPath?: string
): Promise<string> => {
  const dir = findWorkflowDirectory( workflowName, workflowPath );
  if ( !dir ) {
    throw new Error( `Workflow directory for '${workflowName}' not found locally.` );
  }
  const targetPath = resolve( dir, 'scenarios', `${scenarioName}.json` );
  if ( existsSync( targetPath ) ) {
    throw new Error( `Scenario '${scenarioName}' already exists at ${targetPath}` );
  }
  await mkdir( dirname( targetPath ), { recursive: true } );
  await writeFile( targetPath, JSON.stringify( content, null, 2 ) + '\n', 'utf-8' );
  return targetPath;
};
