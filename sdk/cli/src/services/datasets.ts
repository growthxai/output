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
  const dir = resolveDatasetsDir( workflowName, basePath );
  if ( !dir ) {
    return { datasets: [], dir: resolveDefaultDatasetsDir( workflowName, basePath ) };
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
