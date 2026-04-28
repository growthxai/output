import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { resolveScenarioPath } from '#utils/scenario_resolver.js';

const WORKFLOWS_PATHS = [ 'src/workflows', 'workflows' ];

export const readScenario = async ( workflowName: string, scenarioName: string ): Promise<unknown> => {
  const resolution = await resolveScenarioPath( workflowName, scenarioName );
  if ( !resolution.found || !resolution.path ) {
    throw new Error( `Scenario '${scenarioName}' not found for workflow '${workflowName}'.` );
  }
  const content = await readFile( resolution.path, 'utf-8' );
  return JSON.parse( content );
};

const findWorkflowDirectory = ( workflowName: string ): string | null => {
  for ( const wfDir of WORKFLOWS_PATHS ) {
    const candidate = resolve( process.cwd(), wfDir, workflowName );
    if ( existsSync( candidate ) ) {
      return candidate;
    }
  }
  return null;
};

export const writeScenario = async (
  workflowName: string,
  scenarioName: string,
  content: unknown
): Promise<string> => {
  const dir = findWorkflowDirectory( workflowName );
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
