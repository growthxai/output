import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationError } from '@outputai/core';
import { loadSkills, recursiveLoadSkillFile } from './skills.js';

const dirs = [];

const tempDir = () => {
  const dir = mkdtempSync( join( tmpdir(), 'skills-' ) );
  dirs.push( dir );
  return dir;
};

const writeSkill = ( dir, filename, body ) => {
  writeFileSync( join( dir, filename ), body );
};

afterEach( () => {
  for ( const dir of dirs.splice( 0 ) ) {
    rmSync( dir, { recursive: true, force: true } );
  }
} );

describe( 'recursiveLoadSkillFile', () => {
  it( 'returns an empty array for no paths', () => {
    expect( recursiveLoadSkillFile( [] ) ).toEqual( [] );
  } );

  it( 'throws ValidationError when a path is missing', () => {
    const missing = join( tempDir(), 'gone.md' );

    expect( () => recursiveLoadSkillFile( [ missing ] ) ).toThrow( ValidationError );
    expect( () => recursiveLoadSkillFile( [ missing ] ) ).toThrow( `Skill path "${missing}" not found` );
  } );

  it( 'loads an explicitly listed non-md file', () => {
    const dir = tempDir();
    writeSkill( dir, 'notes.txt', 'not a skill' );

    expect( recursiveLoadSkillFile( [ join( dir, 'notes.txt' ) ] ) ).toEqual( [
      { name: 'notes.txt', description: 'notes.txt', instructions: 'not a skill' }
    ] );
  } );

  it( 'loads a markdown file and defaults name/description to the basename', () => {
    const dir = tempDir();
    writeSkill( dir, 'writer.md', '# Writer\n\nDo the thing.\n' );

    expect( recursiveLoadSkillFile( [ join( dir, 'writer.md' ) ] ) ).toEqual( [ {
      name: 'writer',
      description: 'writer',
      instructions: '# Writer\n\nDo the thing.'
    } ] );
  } );

  it( 'uses frontmatter name and description when present', () => {
    const dir = tempDir();
    writeSkill( dir, 'file.md', [
      '---',
      'name: copywriter',
      'description: Writes marketing copy',
      '---',
      '',
      'Use a confident tone.'
    ].join( '\n' ) );

    expect( recursiveLoadSkillFile( [ join( dir, 'file.md' ) ] ) ).toEqual( [ {
      name: 'copywriter',
      description: 'Writes marketing copy',
      instructions: 'Use a confident tone.'
    } ] );
  } );

  it( 'returns an empty array for an empty directory', () => {
    expect( recursiveLoadSkillFile( [ tempDir() ] ) ).toEqual( [] );
  } );

  it( 'loads markdown files from a directory in sorted order and skips other files', () => {
    const dir = tempDir();
    writeSkill( dir, 'z.md', 'zeta' );
    writeSkill( dir, 'a.md', 'alpha' );
    writeSkill( dir, 'readme.txt', 'ignore' );

    expect( recursiveLoadSkillFile( [ dir ] ) ).toEqual( [
      { name: 'a', description: 'a', instructions: 'alpha' },
      { name: 'z', description: 'z', instructions: 'zeta' }
    ] );
  } );

  it( 'recurses into nested directories', () => {
    const dir = tempDir();
    const nested = join( dir, 'nested' );
    mkdirSync( nested );
    writeSkill( dir, 'root.md', 'root' );
    writeSkill( nested, 'child.md', 'child' );

    expect( recursiveLoadSkillFile( [ dir ] ) ).toEqual( [
      { name: 'child', description: 'child', instructions: 'child' },
      { name: 'root', description: 'root', instructions: 'root' }
    ] );
  } );

  it( 'loads files from a directory whose name ends in .md', () => {
    const dir = tempDir();
    const nested = join( dir, 'nested.md' );
    mkdirSync( nested );
    writeSkill( nested, 'child.md', 'child' );

    expect( recursiveLoadSkillFile( [ nested ] ) ).toEqual( [
      { name: 'child', description: 'child', instructions: 'child' }
    ] );
  } );

  it( 'does not follow directory symlinks', () => {
    const dir = tempDir();
    const target = tempDir();
    writeSkill( target, 'external.md', 'external' );
    symlinkSync( target, join( dir, 'linked' ), 'dir' );

    expect( recursiveLoadSkillFile( [ dir ] ) ).toEqual( [] );
  } );
} );

describe( 'loadSkills', () => {
  it( 'returns an empty array when the prompt lists no skills', () => {
    expect( loadSkills( { fileDir: tempDir(), config: { skills: [] } } ) ).toEqual( [] );
  } );

  it( 'resolves skill paths relative to the prompt fileDir', () => {
    const fileDir = tempDir();
    const skillsDir = join( fileDir, 'skills' );
    mkdirSync( skillsDir );
    writeSkill( skillsDir, 'reviewer.md', [
      '---',
      'name: reviewer',
      'description: Reviews drafts',
      '---',
      'Check the brief.'
    ].join( '\n' ) );

    expect( loadSkills( {
      fileDir,
      config: { skills: [ 'skills/reviewer.md' ] }
    } ) ).toEqual( [ {
      name: 'reviewer',
      description: 'Reviews drafts',
      instructions: 'Check the brief.'
    } ] );
  } );

  it( 'loads a directory listed in prompt config', () => {
    const fileDir = tempDir();
    const skillsDir = join( fileDir, 'skills' );
    mkdirSync( skillsDir );
    writeSkill( skillsDir, 'one.md', 'first' );

    expect( loadSkills( {
      fileDir,
      config: { skills: [ 'skills' ] }
    } ) ).toEqual( [ {
      name: 'one',
      description: 'one',
      instructions: 'first'
    } ] );
  } );
} );
