import { execFile as execFileCb, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import debugFactory from 'debug';
import semver from 'semver';
import packageJson from '../../package.json' with { type: 'json' };

const execFile = promisify( execFileCb );
const debug = debugFactory( 'output-cli:npm-update' );

const PACKAGE_NAME = packageJson.name;

/* eslint-disable @typescript-eslint/no-explicit-any */

function findVersionInTree( deps: Record<string, any> | undefined ): string | null {
  if ( !deps ) {
    return null;
  }

  if ( deps[PACKAGE_NAME]?.version ) {
    return deps[PACKAGE_NAME].version;
  }

  for ( const dep of Object.values( deps ) ) {
    const found = findVersionInTree( dep.dependencies );
    if ( found ) {
      return found;
    }
  }

  return null;
}

function parseNpmLsVersion( output: string ): string | null {
  try {
    const parsed = JSON.parse( output );
    return findVersionInTree( parsed.dependencies );
  } catch {
    return null;
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFile( 'npm', [ 'view', PACKAGE_NAME, 'version' ] );
    const version = stdout.trim();
    return version || null;
  } catch ( error ) {
    debug( 'Failed to fetch latest version: %O', error );
    return null;
  }
}

export async function getGlobalInstalledVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFile( 'npm', [ 'ls', '-g', PACKAGE_NAME, '--json' ] );
    return parseNpmLsVersion( stdout );
  } catch ( error ) {
    debug( 'Failed to get global version: %O', error );
    return null;
  }
}

export async function getLocalInstalledVersion( cwd: string ): Promise<string | null> {
  try {
    const { stdout } = await execFile( 'npm', [ 'ls', PACKAGE_NAME, '--json' ], { cwd } );
    return parseNpmLsVersion( stdout );
  } catch ( error ) {
    debug( 'Failed to get local version: %O', error );
    return null;
  }
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
  await spawnInherit( 'npm', [ 'install', '-g', '--ignore-scripts', `${PACKAGE_NAME}@latest` ] );
}

export async function updateLocal( cwd: string ): Promise<void> {
  await spawnInherit( 'npm', [ 'update', '--ignore-scripts', PACKAGE_NAME ], cwd );
}

export function isOutdated( current: string, latest: string ): boolean {
  return semver.lt( current, latest );
}
