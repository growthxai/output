import { execFile as execFileCb, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import debugFactory from 'debug';
import semver from 'semver';
import packageJson from '../../package.json' with { type: 'json' };

const execFile = promisify( execFileCb );
const debug = debugFactory( 'output-cli:npm-update' );

const CLI_PACKAGE_NAME = packageJson.name;
const VERSION_SOURCE_PACKAGE_NAME = '@outputai/core';
export const LOCAL_SDK_PACKAGE_NAMES = [
  '@outputai/cli',
  '@outputai/core',
  '@outputai/http',
  '@outputai/llm',
  '@outputai/credentials',
  '@outputai/evals'
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LocalInstalledPackage {
  name: string;
  version: string;
}

function findVersionInTree( deps: Record<string, any> | undefined, packageName: string ): string | null {
  if ( !deps ) {
    return null;
  }

  if ( deps[packageName]?.version ) {
    return deps[packageName].version;
  }

  for ( const dep of Object.values( deps ) ) {
    const found = findVersionInTree( dep.dependencies, packageName );
    if ( found ) {
      return found;
    }
  }

  return null;
}

function parseNpmLsVersion( output: string, packageName: string ): string | null {
  try {
    const parsed = JSON.parse( output );
    return findVersionInTree( parsed.dependencies, packageName );
  } catch {
    return null;
  }
}

async function readDirectOutputDependencies( cwd: string ): Promise<Set<string>> {
  try {
    const raw = await readFile( path.join( cwd, 'package.json' ), 'utf-8' );
    const pkg = JSON.parse( raw ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set( [
      ...Object.keys( pkg.dependencies ?? {} ),
      ...Object.keys( pkg.devDependencies ?? {} )
    ] );
  } catch ( error ) {
    debug( 'Failed to read local package.json: %O', error );
    return new Set();
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFile( 'npm', [ 'view', VERSION_SOURCE_PACKAGE_NAME, 'version' ] );
    const version = stdout.trim();
    return version || null;
  } catch ( error ) {
    debug( 'Failed to fetch latest version: %O', error );
    return null;
  }
}

export async function getGlobalInstalledVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFile( 'npm', [ 'ls', '-g', CLI_PACKAGE_NAME, '--json' ] );
    return parseNpmLsVersion( stdout, CLI_PACKAGE_NAME );
  } catch ( error ) {
    debug( 'Failed to get global version: %O', error );
    return null;
  }
}

export async function getLocalInstalledVersion( cwd: string ): Promise<string | null> {
  try {
    const { stdout } = await execFile( 'npm', [ 'ls', CLI_PACKAGE_NAME, '--json' ], { cwd } );
    return parseNpmLsVersion( stdout, CLI_PACKAGE_NAME );
  } catch ( error ) {
    debug( 'Failed to get local version: %O', error );
    return null;
  }
}

export async function getLocalInstalledPackages( cwd: string ): Promise<LocalInstalledPackage[]> {
  const directDeps = await readDirectOutputDependencies( cwd );
  const packageNames: string[] = LOCAL_SDK_PACKAGE_NAMES.filter( name => directDeps.has( name ) );

  const versions = await Promise.all(
    packageNames.map( async name => {
      try {
        const { stdout } = await execFile( 'npm', [ 'ls', name, '--json' ], { cwd } );
        const version = parseNpmLsVersion( stdout, name );
        return version ? { name, version } : null;
      } catch ( error ) {
        debug( 'Failed to get local version for %s: %O', name, error );
        return null;
      }
    } )
  );

  return versions.filter( ( item ): item is LocalInstalledPackage => item !== null );
}

function spawnInherit( command: string, args: string[], cwd?: string ): Promise<void> {
  return new Promise( ( resolve, reject ) => {
    const proc = spawn( command, args, { cwd, stdio: 'inherit' } );

    proc.on( 'error', reject );
    proc.on( 'close', code => {
      if ( code === 0 ) {
        resolve();
      } else {
        reject( new Error( `${command} exited with code ${code}` ) );
      }
    } );
  } );
}

export async function updateGlobal(): Promise<void> {
  await spawnInherit( 'npm', [ 'install', '-g', '--ignore-scripts', `${CLI_PACKAGE_NAME}@latest` ] );
}

export async function updateLocal( cwd: string, packageNames: string[], version: string ): Promise<void> {
  const packages = packageNames.map( name => `${name}@${version}` );
  await spawnInherit( 'npm', [ 'install', '--ignore-scripts', '--save-exact', ...packages ], cwd );
}

export function isOutdated( current: string, latest: string ): boolean {
  return semver.lt( current, latest );
}
