import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import { DatasetSchema } from '@outputai/evals';
import type { Dataset } from '@outputai/evals';
import { getTrace } from '#services/trace_reader.js';
import { sanitizeSecrets } from '#utils/secret_sanitizer.js';
import { resolveWorkflowDir, WORKFLOWS_PATHS } from '#utils/workflow_dir.js';
import { getWorkflowsBasePath } from '#utils/paths.js';

const DATASETS_DIR = 'tests/datasets';

export interface DatasetInfo {
  name: string;
  path: string;
  hasLastOutput: boolean;
  lastOutputDate?: string;
  lastEvalDate?: string;
}

export async function resolveDatasetsDir(
  workflowName: string,
  basePath?: string,
  workflowPath?: string
): Promise<string | null> {
  const workflowDir = await resolveWorkflowDir( workflowName, basePath, workflowPath );
  if ( !workflowDir ) {
    return null;
  }
  const datasetsDir = resolve( workflowDir, DATASETS_DIR );
  return existsSync( datasetsDir ) ? datasetsDir : null;
}

export async function resolveDefaultDatasetsDir(
  workflowName: string,
  basePath?: string,
  workflowPath?: string
): Promise<string> {
  // Write into the resolved workflow's tests/datasets — even when it doesn't
  // exist yet (first generation) — so nested workflows get the right location.
  const workflowDir = await resolveWorkflowDir( workflowName, basePath, workflowPath );
  if ( workflowDir ) {
    return resolve( workflowDir, DATASETS_DIR );
  }

  // Workflow not found (unknown name / API unavailable): flat convention.
  return resolve( basePath ?? getWorkflowsBasePath(), WORKFLOWS_PATHS[0], workflowName, DATASETS_DIR );
}

export async function readDatasetFile( filePath: string ): Promise<Dataset[]> {
  const raw = yaml.load( await readFile( filePath, 'utf-8' ) );

  if ( !raw || typeof raw !== 'object' || Array.isArray( raw ) ) {
    throw new Error( `Invalid dataset file: ${filePath}` );
  }

  return Object.entries( raw as Record<string, unknown> ).map( ( [ name, body ] ) => {
    if ( !body || typeof body !== 'object' || !( 'input' in body ) ) {
      throw new Error( `Dataset case "${name}" in ${filePath} is missing required "input" field` );
    }
    const dataset = DatasetSchema.parse( { name, ...( body as object ) } ) as Dataset;
    dataset._source = filePath;
    return dataset;
  } );
}

export async function readAllDatasets(
  workflowName: string,
  filterNames?: string[],
  basePath?: string
): Promise<{ datasets: Dataset[]; dir: string }> {
  const dir = await resolveDatasetsDir( workflowName, basePath );
  if ( !dir ) {
    return { datasets: [], dir: await resolveDefaultDatasetsDir( workflowName, basePath ) };
  }

  const files = await readdir( dir );
  const ymlFiles = files.filter( f => f.endsWith( '.yml' ) || f.endsWith( '.yaml' ) );

  const seen = new Set<string>();
  const datasets: Dataset[] = [];
  for ( const file of ymlFiles ) {
    const cases = await readDatasetFile( join( dir, file ) );
    for ( const dataset of cases ) {
      if ( seen.has( dataset.name ) ) {
        throw new Error( `Duplicate dataset case name "${dataset.name}" found in ${file}` );
      }
      seen.add( dataset.name );
      if ( filterNames && !filterNames.includes( dataset.name ) ) {
        continue;
      }
      datasets.push( dataset );
    }
  }

  return { datasets, dir };
}

export async function writeDataset( dataset: Dataset, filePath: string ): Promise<void> {
  const dir = resolve( filePath, '..' );
  if ( !existsSync( dir ) ) {
    await mkdir( dir, { recursive: true } );
  }

  const loaded = existsSync( filePath ) ? yaml.load( await readFile( filePath, 'utf-8' ) ) : null;
  const fileObj: Record<string, unknown> =
    ( loaded && typeof loaded === 'object' && !Array.isArray( loaded ) ) ?
      loaded as Record<string, unknown> :
      {};

  const { name, _source, ...caseBody } = dataset;
  fileObj[name] = { ...( fileObj[name] as object ), ...caseBody };

  await writeFile( filePath, yaml.dump( fileObj, { lineWidth: 120, noRefs: true, sortKeys: false } ), 'utf-8' );
}

export async function listDatasets(
  workflowName: string,
  basePath?: string
): Promise<DatasetInfo[]> {
  const dir = await resolveDatasetsDir( workflowName, basePath );
  if ( !dir ) {
    return [];
  }

  const files = await readdir( dir );
  const ymlFiles = files.filter( f => f.endsWith( '.yml' ) || f.endsWith( '.yaml' ) );

  const results: DatasetInfo[] = [];
  for ( const file of ymlFiles ) {
    const filePath = join( dir, file );
    try {
      const cases = await readDatasetFile( filePath );
      for ( const dataset of cases ) {
        results.push( {
          name: dataset.name,
          path: filePath,
          hasLastOutput: dataset.last_output?.output !== undefined,
          lastOutputDate: dataset.last_output?.date,
          lastEvalDate: dataset.last_eval?.date
        } );
      }
    } catch {
      results.push( {
        name: file.replace( /\.(yml|yaml)$/, '' ),
        path: filePath,
        hasLastOutput: false
      } );
    }
  }

  return results;
}

export function buildDataset(
  name: string,
  input: Record<string, unknown>,
  output: unknown,
  executionTimeMs?: number
): Dataset {
  return {
    name,
    input: sanitizeSecrets( input ) as Record<string, unknown>,
    last_output: {
      output: sanitizeSecrets( output ),
      executionTimeMs,
      date: new Date().toISOString()
    }
  };
}

export function extractDatasetName( tracePathOrKey: string ): string {
  return tracePathOrKey.replace( /^.*\//, '' ).replace( /\.json$/, '' );
}

// Resolve the .yml path for a dataset case, sanitizing the name so it can never
// escape the datasets directory regardless of where the name came from
// (scenario arg, --name flag, or a workflow ID).
export function datasetFilePath( dir: string, name: string ): string {
  const safeName = name.replace( /[^a-zA-Z0-9._-]/g, '_' );
  return join( dir, `${safeName}.yml` );
}

export function getExecutionTime( workflowId: string | undefined ): Promise<number | undefined> {
  if ( !workflowId ) {
    return Promise.resolve( undefined );
  }
  return getTrace( workflowId )
    .then( traceResult => {
      const root = traceResult.data.root;
      return ( root.startTime && root.endTime ) ?
        root.endTime - root.startTime :
        root.duration;
    } )
    .catch( () => undefined );
}
