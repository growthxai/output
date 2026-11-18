/* eslint-disable no-restricted-syntax, init-declarations */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateWorkflow } from './workflow_generator.js';

describe( 'Workflow Generator', () => {
  let tempDir: string;

  beforeEach( async () => {
    tempDir = await fs.mkdtemp( path.join( os.tmpdir(), 'workflow-gen-test-' ) );
  } );

  afterEach( async () => {
    await fs.rm( tempDir, { recursive: true, force: true } );
  } );

  describe( 'skeleton generation', () => {
    it( 'should create prompts folder with prompt template', async () => {
      const result = await generateWorkflow( {
        name: 'testWorkflow',
        description: 'Test workflow',
        outputDir: tempDir,
        skeleton: true,
        force: false
      } );

      const promptPath = path.join( result.targetDir, 'prompts', 'example@v1.prompt' );
      const promptExists = await fs.access( promptPath ).then( () => true ).catch( () => false );

      expect( promptExists ).toBe( true );
      expect( result.filesCreated ).toContain( 'prompts/example@v1.prompt' );
    } );

    it( 'should create scenarios folder with test_input.json', async () => {
      const result = await generateWorkflow( {
        name: 'testWorkflow',
        description: 'Test workflow',
        outputDir: tempDir,
        skeleton: true,
        force: false
      } );

      const scenarioPath = path.join( result.targetDir, 'scenarios', 'test_input.json' );
      const scenarioExists = await fs.access( scenarioPath ).then( () => true ).catch( () => false );

      expect( scenarioExists ).toBe( true );
      expect( result.filesCreated ).toContain( 'scenarios/test_input.json' );
    } );

    it( 'should create valid JSON in scenario file', async () => {
      const result = await generateWorkflow( {
        name: 'testWorkflow',
        description: 'Test workflow',
        outputDir: tempDir,
        skeleton: true,
        force: false
      } );

      const scenarioPath = path.join( result.targetDir, 'scenarios', 'test_input.json' );
      const content = await fs.readFile( scenarioPath, 'utf-8' );
      const parsed = JSON.parse( content );

      expect( parsed ).toHaveProperty( 'text' );
    } );

    it( 'should create all expected skeleton files', async () => {
      const result = await generateWorkflow( {
        name: 'testWorkflow',
        description: 'Test workflow',
        outputDir: tempDir,
        skeleton: true,
        force: false
      } );

      const expectedFiles = [
        'workflow.ts',
        'steps.ts',
        'evaluators.ts',
        'types.ts',
        'README.md',
        'prompts/example@v1.prompt',
        'scenarios/test_input.json'
      ];

      for ( const file of expectedFiles ) {
        expect( result.filesCreated ).toContain( file );
      }
    } );

  } );
} );
