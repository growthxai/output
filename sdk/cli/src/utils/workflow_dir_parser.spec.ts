/* eslint-disable no-restricted-syntax, init-declarations */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseWorkflowDir } from './workflow_dir_parser.js';

describe( 'parseWorkflowDir', () => {
  let tempDir: string;

  beforeEach( () => {
    tempDir = mkdtempSync( join( tmpdir(), 'workflow-dir-parser-' ) );
  } );

  afterEach( () => {
    rmSync( tempDir, { recursive: true, force: true } );
  } );

  it( 'should extract workflow ID from workflow.ts', () => {
    writeFileSync(
      join( tempDir, 'workflow.ts' ),
      'export default workflow( { name: \'myWorkflow\', description: \'test\' } );'
    );

    const result = parseWorkflowDir( tempDir );
    expect( result.workflowId ).toBe( 'myWorkflow' );
  } );

  it( 'should extract workflow ID from workflow.js', () => {
    writeFileSync(
      join( tempDir, 'workflow.js' ),
      'export default workflow( { name: "blogGenerator", description: "test" } );'
    );

    const result = parseWorkflowDir( tempDir );
    expect( result.workflowId ).toBe( 'blogGenerator' );
  } );

  it( 'should prefer workflow.ts over workflow.js', () => {
    writeFileSync(
      join( tempDir, 'workflow.ts' ),
      'export default workflow( { name: \'fromTs\' } );'
    );
    writeFileSync(
      join( tempDir, 'workflow.js' ),
      'export default workflow( { name: \'fromJs\' } );'
    );

    const result = parseWorkflowDir( tempDir );
    expect( result.workflowId ).toBe( 'fromTs' );
  } );

  it( 'should return undefined workflowId when no workflow file exists', () => {
    const result = parseWorkflowDir( tempDir );
    expect( result.workflowId ).toBeUndefined();
  } );

  it( 'should list scenario names from scenarios directory', () => {
    const scenariosDir = join( tempDir, 'scenarios' );
    mkdirSync( scenariosDir );
    writeFileSync( join( scenariosDir, 'test_input.json' ), '{}' );
    writeFileSync( join( scenariosDir, 'edge_case.json' ), '{}' );

    const result = parseWorkflowDir( tempDir );
    expect( result.scenarioNames ).toEqual(
      expect.arrayContaining( [ 'test_input', 'edge_case' ] )
    );
    expect( result.scenarioNames ).toHaveLength( 2 );
  } );

  it( 'should return empty scenarioNames when no scenarios directory exists', () => {
    const result = parseWorkflowDir( tempDir );
    expect( result.scenarioNames ).toEqual( [] );
  } );

  it( 'should ignore non-json files in scenarios directory', () => {
    const scenariosDir = join( tempDir, 'scenarios' );
    mkdirSync( scenariosDir );
    writeFileSync( join( scenariosDir, 'test_input.json' ), '{}' );
    writeFileSync( join( scenariosDir, 'README.md' ), '# Scenarios' );

    const result = parseWorkflowDir( tempDir );
    expect( result.scenarioNames ).toEqual( [ 'test_input' ] );
  } );

  it( 'should handle multiline workflow files', () => {
    writeFileSync(
      join( tempDir, 'workflow.ts' ),
      `import { workflow } from '@outputai/core';

export default workflow( {
  name: 'complexWorkflow',
  description: 'A complex workflow',
  fn: async ( input ) => {
    return input;
  }
} );`
    );

    const result = parseWorkflowDir( tempDir );
    expect( result.workflowId ).toBe( 'complexWorkflow' );
  } );
} );
