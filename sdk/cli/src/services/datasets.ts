import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import { DatasetSchema } from '@outputai/evals';
import type { Dataset } from '@outputai/evals';
import { getTrace } from '#services/trace_reader.js';
import { sanitizeSecrets } from '#utils/secret_sanitizer.js';

const DATASETS_DIR = 'tests/datasets';
const WORKFLOWS_PATHS = [ 'src/workflows', 'workflows' ];

export interface DatasetInfo {
  name: string;
  path: string;
  hasLastOutput: boolean;
  lastOutputDate?: string;
  lastEvalDate?: string;
}

export function resolveDatasetsDir(
  workflowName: string,
  basePath: string = process.cwd()
): string | null {
  for ( const workflowsDir of WORKFLOWS_PATHS ) {
    const candidate = resolve( basePath, workflowsDir, workflowName, DATASETS_DIR );
    if ( existsSync( candidate ) ) {
      return candidate;
    }
  }
  return null;
}

export function resolveDefaultDatasetsDir(
  workflowName: string,
  basePath: string = process.cwd()
): string {
  const existing = resolveDatasetsDir( workflowName, basePath );
  if ( existing ) {
    return existing;
  }

  // Default to first workflows path
  return resolve( basePath, WORKFLOWS_PATHS[0], workflowName, DATASETS_DIR );
}

export async function readDataset( filePath: string ): Promise<Dataset> {
  const content = await readFile( filePath, 'utf-8' );
  const raw = yaml.load( content );
  return DatasetSchema.parse( raw ) as Dataset;
}

export async function readAllDatasets(
  workflowName: string,
  filterNames?: string[],
  basePath?: string
): Promise<{ datasets: Dataset[]; dir: string }> {
  const dir = resolveDatasetsDir( workflowName, basePath );
  if ( !dir ) {
    return { datasets: [], dir: resolveDefaultDatasetsDir( workflowName, basePath ) };
  }

  const files = await readdir( dir );
  const ymlFiles = files.filter( f => f.endsWith( '.yml' ) || f.endsWith( '.yaml' ) );

  const datasets: Dataset[] = [];
  for ( const file of ymlFiles ) {
    const dataset = await readDataset( join( dir, file ) );
    if ( filterNames && !filterNames.includes( dataset.name ) ) {
      continue;
    }
    datasets.push( dataset );
  }

  return { datasets, dir };
}

async function mergeWithExisting( dataset: Dataset, filePath: string ): Promise<Dataset> {
  if ( !existsSync( filePath ) ) {
    return dataset;
  }

  try {
    const existing = await readDataset( filePath );
    return {
      ...existing,
      ...dataset,
      ground_truth: dataset.ground_truth ?? existing.ground_truth,
      last_output: dataset.last_output ?? existing.last_output,
      last_eval: dataset.last_eval ?? existing.last_eval
    };
  } catch {
    return dataset;
  }
}

export async function writeDataset( dataset: Dataset, filePath: string ): Promise<void> {
  const merged = await mergeWithExisting( dataset, filePath );

  const dir = resolve( filePath, '..' );
  if ( !existsSync( dir ) ) {
    await mkdir( dir, { recursive: true } );
  }

  const content = yaml.dump( merged, { lineWidth: 120, noRefs: true, sortKeys: false } );
  await writeFile( filePath, content, 'utf-8' );
}

export async function listDatasets(
  workflowName: string,
  basePath?: string
): Promise<DatasetInfo[]> {
  const dir = resolveDatasetsDir( workflowName, basePath );
  if ( !dir ) {
    return [];
  }

  const files = await readdir( dir );
  const ymlFiles = files.filter( f => f.endsWith( '.yml' ) || f.endsWith( '.yaml' ) );

  const results: DatasetInfo[] = [];
  for ( const file of ymlFiles ) {
    const filePath = join( dir, file );
    try {
      const dataset = await readDataset( filePath );
      results.push( {
        name: dataset.name,
        path: filePath,
        hasLastOutput: dataset.last_output?.output !== undefined,
        lastOutputDate: dataset.last_output?.date,
        lastEvalDate: dataset.last_eval?.date
      } );
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
