import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FatalError, ValidationError } from '@outputai/core';

const aiMocks = vi.hoisted( () => ( {
  tool: vi.fn( def => ( { ...def, _tool: true } ) )
} ) );

vi.mock( 'ai', () => ( {
  tool: ( ...args ) => aiMocks.tool( ...args )
} ) );

const importSut = async () => import( './skill.js' );

const makeTempDir = () => mkdtempSync( join( tmpdir(), 'skill-test-' ) );

describe( 'skill', () => {
  it( 'creates an inline skill with a default description', async () => {
    const { skill } = await importSut();

    expect( skill( { name: 'writer', instructions: '# Writer' } ) ).toEqual( {
      name: 'writer',
      description: 'writer',
      instructions: '# Writer'
    } );
  } );

  it( 'throws when name or instructions are missing', async () => {
    const { skill } = await importSut();

    expect( () => skill( { instructions: '# Missing name' } ) ).toThrow( ValidationError );
    expect( () => skill( { name: 'missing_instructions' } ) ).toThrow( ValidationError );
  } );
} );

describe( 'skill file loading', () => {
  it( 'loads a skill file using frontmatter metadata', async () => {
    const dir = makeTempDir();
    const filePath = join( dir, 'copy.md' );
    writeFileSync( filePath, `---
name: copywriter
description: Writes concise copy
---

# Copy
Write clearly.
` );

    const { loadSkillFile } = await importSut();

    expect( loadSkillFile( filePath ) ).toEqual( {
      name: 'copywriter',
      description: 'Writes concise copy',
      instructions: '# Copy\nWrite clearly.'
    } );
  } );

  it( 'uses the markdown filename when frontmatter omits name and description', async () => {
    const dir = makeTempDir();
    const filePath = join( dir, 'research.md' );
    writeFileSync( filePath, '# Research\nSearch carefully.\n' );

    const { loadSkillFile } = await importSut();

    expect( loadSkillFile( filePath ) ).toEqual( {
      name: 'research',
      description: 'research',
      instructions: '# Research\nSearch carefully.'
    } );
  } );

  it( 'loads skills from a file path and a directory path, sorting directory markdown files', async () => {
    const promptDir = makeTempDir();
    const skillsDir = join( promptDir, 'skills' );
    mkdirSync( skillsDir );
    writeFileSync( join( promptDir, 'single.md' ), '# Single' );
    writeFileSync( join( skillsDir, 'b.md' ), '# B' );
    writeFileSync( join( skillsDir, 'a.md' ), '# A' );
    writeFileSync( join( skillsDir, 'ignore.txt' ), '# Ignored' );

    const { loadPromptSkills } = await importSut();
    const result = loadPromptSkills( [ './single.md', './skills' ], promptDir );

    expect( result.map( s => s.name ) ).toEqual( [ 'single', 'a', 'b' ] );
  } );

  it( 'throws FatalError for a missing skill path', async () => {
    const { loadPromptSkills } = await importSut();

    expect( () => loadPromptSkills( './missing.md', makeTempDir() ) ).toThrow( FatalError );
  } );

  it( 'loads colocated skills and returns an empty array when no skills directory exists', async () => {
    const promptDir = makeTempDir();
    const skillsDir = join( promptDir, 'skills' );
    mkdirSync( skillsDir );
    writeFileSync( join( skillsDir, 'style.md' ), '# Style' );

    const { loadColocatedSkills } = await importSut();

    expect( loadColocatedSkills( promptDir ).map( s => s.name ) ).toEqual( [ 'style' ] );
    expect( loadColocatedSkills( makeTempDir() ) ).toEqual( [] );
  } );
} );

describe( 'resolvePromptSkills', () => {
  it( 'uses explicit prompt skills and skips colocated auto-discovery', async () => {
    const promptDir = makeTempDir();
    const explicitDir = join( promptDir, 'explicit' );
    const autoDir = join( promptDir, 'skills' );
    mkdirSync( explicitDir );
    mkdirSync( autoDir );
    writeFileSync( join( explicitDir, 'explicit.md' ), '# Explicit' );
    writeFileSync( join( autoDir, 'auto.md' ), '# Auto' );
    const callerSkill = { name: 'caller', description: 'Caller', instructions: '# Caller' };

    const { resolvePromptSkills } = await importSut();
    const result = resolvePromptSkills( {
      config: { skills: [ './explicit' ] },
      promptFileDir: promptDir
    }, [ callerSkill ] );

    expect( result.map( s => s.name ) ).toEqual( [ 'explicit', 'caller' ] );
  } );

  it( 'auto-discovers colocated skills when prompt config has no explicit skills', async () => {
    const promptDir = makeTempDir();
    const skillsDir = join( promptDir, 'skills' );
    mkdirSync( skillsDir );
    writeFileSync( join( skillsDir, 'auto.md' ), '# Auto' );

    const { resolvePromptSkills } = await importSut();
    const result = resolvePromptSkills( { config: {}, promptFileDir: promptDir } );

    expect( result.map( s => s.name ) ).toEqual( [ 'auto' ] );
  } );
} );

describe( 'skill prompt helpers', () => {
  it( 'builds the system skills message', async () => {
    const { buildSystemSkillsVar } = await importSut();

    expect( buildSystemSkillsVar( [
      { name: 'copy', description: 'Copywriting' },
      { name: 'research', description: 'Research' }
    ] ) ).toBe(
      'Available skills (use load_skill to get full instructions):\n' +
      '- copy: Copywriting\n' +
      '- research: Research'
    );
  } );

  it( 'builds a load_skill tool that returns instructions or an available-skills message', async () => {
    const skills = [
      { name: 'copy', description: 'Copywriting', instructions: '# Copy' },
      { name: 'research', description: 'Research', instructions: '# Research' }
    ];

    const { buildLoadSkillTool } = await importSut();
    const result = buildLoadSkillTool( skills );

    expect( aiMocks.tool ).toHaveBeenCalledWith( expect.objectContaining( {
      description: 'Get detailed instructions for a named skill',
      inputSchema: expect.any( Object ),
      execute: expect.any( Function )
    } ) );
    expect( result.execute( { name: 'copy' } ) ).toBe( '# Copy' );
    expect( result.execute( { name: 'missing' } ) ).toBe( 'Skill "missing" not found. Available: copy, research' );
  } );
} );
