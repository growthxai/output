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
const DEPRECATED_WRAPPER_PACKAGE_NAME = '@outputai/output';
export const DEPRECATED_WRAPPER_PACKAGE_WARNING =
  'This project depends on the deprecated @outputai/output wrapper package, which can hide transitive SDK modules ' +
  'as ghost dependencies. Run `output migrate`, re-scaffold the project, or install the Output SDK packages you use directly.';
const REGISTRY_URL = 'https://registry.npmjs.org';
const REGISTRY_TIMEOUT_MS = 5000;
export const LOCAL_SDK_PACKAGE_NAMES = [
  '@outputai/cli',
  '@outputai/core',
  '@outputai/http',
  '@outputai/llm',
  '@outputai/credentials',
  '@outputai/evals'
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LocalSdkPackage {
  name: string;
  version: string;
  dependencyType: 'dependencies' | 'devDependencies';
}

interface PackageJsonDependency {
  version: string;
  dependencyType: LocalSdkPackage['dependencyType'];
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

async function readPackageJsonDependencies( cwd: string ): Promise<Map<string, PackageJsonDependency>> {
  try {
    const raw = await readFile( path.join( cwd, 'package.json' ), 'utf-8' );
    const pkg = JSON.parse( raw ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageJsonDeps = new Map<string, PackageJsonDependency>();

    for ( const [ name, version ] of Object.entries( pkg.dependencies ?? {} ) ) {
      packageJsonDeps.set( name, { version, dependencyType: 'dependencies' } );
    }

    for ( const [ name, version ] of Object.entries( pkg.devDependencies ?? {} ) ) {
      packageJsonDeps.set( name, { version, dependencyType: 'devDependencies' } );
    }

    return packageJsonDeps;
  } catch ( error ) {
    debug( 'Failed to read local package.json: %O', error );
    return new Map();
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch( `${REGISTRY_URL}/${CLI_PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout( REGISTRY_TIMEOUT_MS )
    } );
    if ( !response.ok ) {
      debug( 'Registry responded with status %d', response.status );
      return null;
    }
    const data = await response.json() as { version?: string };
    return data.version || null;
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

export async function getLocalSdkPackages( cwd: string ): Promise<LocalSdkPackage[]> {
  const packageJsonDeps = await readPackageJsonDependencies( cwd );

  return LOCAL_SDK_PACKAGE_NAMES.flatMap( name => {
    const dependency = packageJsonDeps.get( name );

    return dependency ? [ { name, ...dependency } ] : [];
  } );
}

export async function hasDeprecatedWrapperPackage( cwd: string ): Promise<boolean> {
  const packageJsonDeps = await readPackageJsonDependencies( cwd );
  return packageJsonDeps.has( DEPRECATED_WRAPPER_PACKAGE_NAME );
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

export async function updateLocalPackages( cwd: string, packages: LocalSdkPackage[], version: string ): Promise<void> {
  const dependencies = packages
    .filter( pkg => pkg.dependencyType === 'dependencies' )
    .map( pkg => `${pkg.name}@${version}` );
  const devDependencies = packages
    .filter( pkg => pkg.dependencyType === 'devDependencies' )
    .map( pkg => `${pkg.name}@${version}` );

  if ( dependencies.length > 0 ) {
    await spawnInherit( 'npm', [ 'install', '--ignore-scripts', '--save-exact', ...dependencies ], cwd );
  }

  if ( devDependencies.length > 0 ) {
    await spawnInherit( 'npm', [ 'install', '--ignore-scripts', '--save-dev', '--save-exact', ...devDependencies ], cwd );
  }
}

export function isOutdated( current: string, latest: string ): boolean {
  return semver.lt( current, latest );
}

export function isPackageJsonVersionOutdated( version: string, latest: string ): boolean {
  const range = semver.validRange( version, { includePrerelease: true } );

  if ( !range ) {
    return false;
  }

  return !semver.satisfies( latest, range, { includePrerelease: true } );
}
