import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fetchWorkflowCatalog } from '#api/workflow_catalog.js';
import { getWorkflowsBasePath } from '#utils/paths.js';

export const WORKFLOWS_PATHS = [ 'src/workflows', 'workflows' ];

export function extractWorkflowRelativePath( path: string ): string | null {
  const match = path.match( /(?:^|\/)workflows\/(.+)\/workflow\.[jt]s$/ );
  return match ? match[1] : null;
}

function unique( values: string[] ): string[] {
  return [ ...new Set( values ) ];
}

function workflowPathSuffixes( workflowPath: string ): string[][] {
  const parts = dirname( workflowPath ).split( /[/\\]+/ ).filter( Boolean );
  return parts.map( ( _, index ) => parts.slice( index ) );
}

export function candidateWorkflowDirsFromPath( workflowPath: string, basePath: string ): string[] {
  return unique(
    workflowPathSuffixes( workflowPath ).flatMap( suffix =>
      WORKFLOWS_PATHS.map( workflowsDir => resolve( basePath, workflowsDir, ...suffix ) )
    )
  );
}

export function findWorkflowDirectoryFromPath(
  workflowPath: string | undefined,
  basePath: string = getWorkflowsBasePath()
): string | null {
  if ( !workflowPath ) {
    return null;
  }

  return candidateWorkflowDirsFromPath( workflowPath, basePath ).find( existsSync ) ?? null;
}

export async function fetchWorkflowPath( workflowName: string ): Promise<string | null> {
  try {
    const workflows = await fetchWorkflowCatalog();
    const workflow = workflows.find( w => w.name === workflowName );
    return workflow?.path ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the on-disk directory of a registered workflow by name.
 *
 * Flat-first so flat-layout projects resolve offline (no catalog round-trip)
 * exactly as before; nested folders fall through to the worker catalog, whose
 * `path` is re-rooted under `src/workflows` / `workflows`.
 */
export async function resolveWorkflowDir(
  workflowName: string,
  basePath: string = getWorkflowsBasePath(),
  workflowPath?: string
): Promise<string | null> {
  for ( const workflowsDir of WORKFLOWS_PATHS ) {
    const candidate = resolve( basePath, workflowsDir, workflowName );
    if ( existsSync( candidate ) ) {
      return candidate;
    }
  }

  if ( workflowPath ) {
    const found = findWorkflowDirectoryFromPath( workflowPath, basePath );
    if ( found ) {
      return found;
    }
  }

  const catalogPath = await fetchWorkflowPath( workflowName );
  return findWorkflowDirectoryFromPath( catalogPath ?? undefined, basePath );
}
