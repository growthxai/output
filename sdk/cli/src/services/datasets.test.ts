import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { readDatasetFile, readAllDatasets, writeDataset, listDatasets } from './datasets.js';

const ctx = { tmpDir: '' };

beforeEach( async () => {
  ctx.tmpDir = await mkdtemp( join( tmpdir(), 'output-datasets-test-' ) );
} );

afterEach( async () => {
  await rm( ctx.tmpDir, { recursive: true, force: true } );
} );

function writeYaml( filePath: string, obj: unknown ) {
  return writeFile( filePath, yaml.dump( obj, { lineWidth: 120, noRefs: true, sortKeys: false } ), 'utf-8' );
}

// ---------------------------------------------------------------------------
// readDatasetFile
// ---------------------------------------------------------------------------

describe( 'readDatasetFile', () => {
  it( 'parses a multi-case file and returns all cases', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    await writeYaml( filePath, {
      case_a: { input: { query: 'foo' }, ground_truth: { expected: 1 } },
      case_b: { input: { query: 'bar' } },
      case_c: { input: { query: 'baz' }, ground_truth: { expected: 3 } }
    } );

    const datasets = await readDatasetFile( filePath );

    expect( datasets ).toHaveLength( 3 );
    expect( datasets.map( d => d.name ) ).toEqual( [ 'case_a', 'case_b', 'case_c' ] );
    expect( datasets[0].input ).toEqual( { query: 'foo' } );
    expect( datasets[0].ground_truth ).toEqual( { expected: 1 } );
  } );

  it( 'attaches _source with the absolute file path to each dataset', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    await writeYaml( filePath, {
      my_case: { input: { x: 1 } }
    } );

    const [ dataset ] = await readDatasetFile( filePath );

    expect( dataset._source ).toBe( filePath );
  } );

  it( 'throws when a case is missing input', async () => {
    const filePath = join( ctx.tmpDir, 'bad.yml' );
    await writeYaml( filePath, {
      good_case: { input: { x: 1 } },
      bad_case: { ground_truth: { expected: 42 } }
    } );

    await expect( readDatasetFile( filePath ) ).rejects.toThrow(
      'Dataset case "bad_case" in'
    );
  } );

  it( 'throws when file content is not an object', async () => {
    const filePath = join( ctx.tmpDir, 'bad.yml' );
    await writeFile( filePath, 'just a string', 'utf-8' );

    await expect( readDatasetFile( filePath ) ).rejects.toThrow( 'Invalid dataset file' );
  } );

  it( 'throws with clear message when file content is a YAML array', async () => {
    const filePath = join( ctx.tmpDir, 'bad.yml' );
    await writeFile( filePath, '- foo\n- bar\n', 'utf-8' );

    await expect( readDatasetFile( filePath ) ).rejects.toThrow( 'Invalid dataset file' );
  } );

  it( 'preserves last_output and last_eval fields', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    await writeYaml( filePath, {
      cached_case: {
        input: { q: 'hello' },
        last_output: { output: { result: 42 }, executionTimeMs: 100, date: '2026-01-01T00:00:00.000Z' }
      }
    } );

    const [ dataset ] = await readDatasetFile( filePath );

    expect( dataset.last_output?.output ).toEqual( { result: 42 } );
    expect( dataset.last_output?.executionTimeMs ).toBe( 100 );
  } );
} );

// ---------------------------------------------------------------------------
// readAllDatasets
// ---------------------------------------------------------------------------

describe( 'readAllDatasets', () => {
  it( 'flattens cases from multiple files', async () => {
    const datasetsDir = join( ctx.tmpDir, 'src', 'workflows', 'my_workflow', 'tests', 'datasets' );
    await mkdir( datasetsDir, { recursive: true } );

    await writeYaml( join( datasetsDir, 'group_a.yml' ), {
      case_1: { input: { x: 1 } },
      case_2: { input: { x: 2 } }
    } );
    await writeYaml( join( datasetsDir, 'group_b.yml' ), {
      case_3: { input: { x: 3 } }
    } );

    const { datasets } = await readAllDatasets( 'my_workflow', undefined, ctx.tmpDir );

    expect( datasets ).toHaveLength( 3 );
    expect( datasets.map( d => d.name ).sort() ).toEqual( [ 'case_1', 'case_2', 'case_3' ] );
  } );

  it( 'filters by case name across files', async () => {
    const datasetsDir = join( ctx.tmpDir, 'src', 'workflows', 'my_workflow', 'tests', 'datasets' );
    await mkdir( datasetsDir, { recursive: true } );

    await writeYaml( join( datasetsDir, 'group_a.yml' ), {
      case_1: { input: { x: 1 } },
      case_2: { input: { x: 2 } }
    } );
    await writeYaml( join( datasetsDir, 'group_b.yml' ), {
      case_3: { input: { x: 3 } }
    } );

    const { datasets } = await readAllDatasets( 'my_workflow', [ 'case_2', 'case_3' ], ctx.tmpDir );

    expect( datasets ).toHaveLength( 2 );
    expect( datasets.map( d => d.name ).sort() ).toEqual( [ 'case_2', 'case_3' ] );
  } );

  it( 'returns empty datasets and a default dir when workflow has no datasets dir', async () => {
    const { datasets, dir } = await readAllDatasets( 'nonexistent_workflow', undefined, ctx.tmpDir );

    expect( datasets ).toHaveLength( 0 );
    expect( dir ).toContain( 'nonexistent_workflow' );
  } );

  it( 'throws when the same case name appears in two different files', async () => {
    const datasetsDir = join( ctx.tmpDir, 'src', 'workflows', 'my_workflow', 'tests', 'datasets' );
    await mkdir( datasetsDir, { recursive: true } );

    await writeYaml( join( datasetsDir, 'group_a.yml' ), { case_1: { input: { x: 1 } } } );
    await writeYaml( join( datasetsDir, 'group_b.yml' ), { case_1: { input: { x: 2 } } } );

    await expect( readAllDatasets( 'my_workflow', undefined, ctx.tmpDir ) ).rejects.toThrow(
      'Duplicate dataset case name "case_1"'
    );
  } );
} );

// ---------------------------------------------------------------------------
// writeDataset
// ---------------------------------------------------------------------------

describe( 'writeDataset', () => {
  it( 'creates a new file with one case keyed by name', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    const dataset = { name: 'new_case', input: { q: 'hello' } };

    await writeDataset( dataset, filePath );

    const raw = yaml.load( await readFile( filePath, 'utf-8' ) ) as Record<string, unknown>;
    expect( raw ).toHaveProperty( 'new_case' );
    expect( ( raw.new_case as Record<string, unknown> ).input ).toEqual( { q: 'hello' } );
    expect( raw.new_case ).not.toHaveProperty( 'name' );
  } );

  it( 'does not write _source into the file', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    const dataset = { name: 'my_case', input: { q: 'x' }, _source: '/some/path.yml' };

    await writeDataset( dataset, filePath );

    const raw = yaml.load( await readFile( filePath, 'utf-8' ) ) as Record<string, unknown>;
    expect( ( raw.my_case as Record<string, unknown> ) ).not.toHaveProperty( '_source' );
  } );

  it( 'updates only the target case, leaving other cases untouched', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    await writeYaml( filePath, {
      case_a: { input: { x: 1 }, ground_truth: { expected: 1 } },
      case_b: { input: { x: 2 }, ground_truth: { expected: 2 } }
    } );

    await writeDataset(
      { name: 'case_a', input: { x: 1 }, last_output: { output: { result: 1 }, date: '2026-01-01T00:00:00.000Z' } },
      filePath
    );

    const raw = yaml.load( await readFile( filePath, 'utf-8' ) ) as Record<string, unknown>;
    expect( raw ).toHaveProperty( 'case_b' );
    expect( ( raw.case_b as Record<string, unknown> ).ground_truth ).toEqual( { expected: 2 } );
  } );

  it( 'preserves existing fields when writing last_output then last_eval', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    await writeYaml( filePath, {
      my_case: { input: { q: 'hello' }, ground_truth: { expected: 42 } }
    } );

    await writeDataset(
      { name: 'my_case', input: { q: 'hello' }, last_output: { output: { result: 42 }, executionTimeMs: 50, date: '2026-01-01T00:00:00.000Z' } },
      filePath
    );
    await writeDataset(
      {
        name: 'my_case', input: { q: 'hello' },
        last_eval: { output: { datasetName: 'my_case', verdict: 'pass', evaluators: [] }, date: '2026-01-01T00:01:00.000Z' }
      },
      filePath
    );

    const raw = yaml.load( await readFile( filePath, 'utf-8' ) ) as Record<string, unknown>;
    const caseObj = raw.my_case as Record<string, unknown>;
    expect( caseObj ).toHaveProperty( 'last_output' );
    expect( caseObj ).toHaveProperty( 'last_eval' );
    expect( caseObj ).toHaveProperty( 'ground_truth' );
  } );

  it( 'creates parent directories if they do not exist', async () => {
    const filePath = join( ctx.tmpDir, 'deep', 'nested', 'cases.yml' );
    await writeDataset( { name: 'my_case', input: { q: 'x' } }, filePath );

    const raw = yaml.load( await readFile( filePath, 'utf-8' ) ) as Record<string, unknown>;
    expect( raw ).toHaveProperty( 'my_case' );
  } );

  it( 'recovers gracefully when existing file contains non-object YAML', async () => {
    const filePath = join( ctx.tmpDir, 'cases.yml' );
    await writeFile( filePath, 'just a string', 'utf-8' );

    await writeDataset( { name: 'my_case', input: { q: 'x' } }, filePath );

    const raw = yaml.load( await readFile( filePath, 'utf-8' ) ) as Record<string, unknown>;
    expect( raw ).toHaveProperty( 'my_case' );
  } );
} );

// ---------------------------------------------------------------------------
// listDatasets
// ---------------------------------------------------------------------------

describe( 'listDatasets', () => {
  it( 'returns one DatasetInfo per case across all files', async () => {
    const datasetsDir = join( ctx.tmpDir, 'src', 'workflows', 'my_workflow', 'tests', 'datasets' );
    await mkdir( datasetsDir, { recursive: true } );

    await writeYaml( join( datasetsDir, 'core.yml' ), {
      case_1: { input: { x: 1 }, last_output: { output: { r: 1 }, date: '2026-01-01T00:00:00.000Z' } },
      case_2: { input: { x: 2 } }
    } );

    const infos = await listDatasets( 'my_workflow', ctx.tmpDir );

    expect( infos ).toHaveLength( 2 );
    const case1 = infos.find( i => i.name === 'case_1' )!;
    expect( case1.hasLastOutput ).toBe( true );
    expect( case1.path ).toContain( 'core.yml' );

    const case2 = infos.find( i => i.name === 'case_2' )!;
    expect( case2.hasLastOutput ).toBe( false );
  } );

  it( 'returns empty array when no datasets directory exists', async () => {
    const infos = await listDatasets( 'nonexistent_workflow', ctx.tmpDir );
    expect( infos ).toHaveLength( 0 );
  } );
} );
