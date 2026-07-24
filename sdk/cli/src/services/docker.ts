import { execFileSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ux } from '@oclif/core';
import semver from 'semver';
import { config } from '#config.js';

const DEFAULT_COMPOSE_PATH = '../assets/docker/docker-compose-dev.yml';

export const SERVICE_HEALTH = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  STARTING: 'starting',
  NONE: 'none'
} as const;

export const SERVICE_STATE = {
  RUNNING: 'running',
  CREATED: 'created',
  EXITED: 'exited'
} as const;

class DockerValidationError extends Error {}

interface Prerequisite {
  name: string;
  semverRange: string;
  getVersion: () => string | null;
  errorMessage: ( current: string | null, required: string ) => string;
}

export interface ServiceStatus {
  name: string;
  state: string;
  health: string;
  ports: string[];
}

interface DockerComposePsOutput {
  Service?: string;
  Name?: string;
  State: string;
  Health?: string;
  Publishers?: Array<{ PublishedPort: number; TargetPort: number }>;
}

export class DockerComposeConfigNotFoundError extends Error {
  constructor( dockerComposePath: string ) {
    super( `Docker Compose configuration not found at: ${dockerComposePath}\n\
This may indicate a problem with the CLI installation.` );
  }
}

const checkDockerCommand = ( command: string ): boolean => {
  try {
    execSync( command, { stdio: 'pipe' } );
    return true;
  } catch {
    return false;
  }
};

const getCommandVersion = ( command: string, pattern: RegExp = /(\d+\.\d+\.\d+)/ ): string | null => {
  try {
    const output = execSync( command, { stdio: 'pipe', encoding: 'utf-8' } ).trim();
    const match = output.match( pattern );
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const isDockerInstalled = (): boolean => checkDockerCommand( 'docker --version' );

const PREREQUISITES: Prerequisite[] = [
  {
    name: 'Docker',
    semverRange: '>=20.0.0',
    getVersion: () => getCommandVersion( 'docker --version' ),
    errorMessage: ( current, required ) =>
      current === null ?
        'Docker is not installed. Please install Docker to use the dev command.\nVisit: https://docs.docker.com/get-docker/' :
        `Docker version ${required} is required (found v${current}).\nVisit: https://docs.docker.com/get-docker/`
  },
  {
    name: 'Docker Compose',
    semverRange: '>=2.24.0',
    getVersion: () => getCommandVersion( 'docker compose version --short' ),
    errorMessage: ( current, required ) =>
      current === null ?
        'Docker Compose is not installed. Please install Docker Compose to use the dev command.\nVisit: https://docs.docker.com/compose/install/' :
        `Docker Compose ${required} is required (found v${current}).\nPlease update Docker Compose: https://docs.docker.com/compose/install/`
  },
  {
    name: 'Docker Daemon',
    semverRange: '*',
    getVersion: () => checkDockerCommand( 'docker ps' ) ? '0.0.0' : null,
    errorMessage: () =>
      'Docker daemon is not running. Please start Docker and try again.'
  }
];

export function validateDockerEnvironment(): void {
  for ( const prereq of PREREQUISITES ) {
    const raw = prereq.getVersion();
    const version = raw ? semver.valid( semver.coerce( raw ) ) : null;

    if ( !version ) {
      throw new DockerValidationError( prereq.errorMessage( null, prereq.semverRange ) );
    }

    if ( !semver.satisfies( version, prereq.semverRange ) ) {
      throw new DockerValidationError( prereq.errorMessage( version, prereq.semverRange ) );
    }
  }
}

export function getDefaultDockerComposePath(): string {
  return path.resolve(
    path.dirname( fileURLToPath( import.meta.url ) ),
    DEFAULT_COMPOSE_PATH
  );
}

// Resolve the compose file a `dev` command should act on — a caller-supplied
// path (relative to cwd) or the bundled default — and verify it exists. Shared
// by `dev` and `dev down` so the resolution rule and not-found error stay in
// one place.
export async function resolveDockerComposePath( customPath?: string ): Promise<string> {
  const dockerComposePath = customPath ?
    path.resolve( process.cwd(), customPath ) :
    getDefaultDockerComposePath();

  try {
    await fs.access( dockerComposePath );
  } catch {
    throw new DockerComposeConfigNotFoundError( dockerComposePath );
  }

  return dockerComposePath;
}

export function parseServiceStatus( jsonOutput: string ): ServiceStatus[] {
  if ( !jsonOutput.trim() ) {
    return [];
  }

  return jsonOutput
    .trim()
    .split( '\n' )
    .filter( Boolean )
    .map( line => {
      const data: DockerComposePsOutput = JSON.parse( line );
      return {
        name: data.Service || data.Name || 'unknown',
        state: data.State,
        health: data.Health || SERVICE_HEALTH.NONE,
        ports: data.Publishers?.map( p => `${p.PublishedPort}:${p.TargetPort}` ) || []
      };
    } );
}

export async function getServiceStatus( dockerComposePath: string ): Promise<ServiceStatus[]> {
  const result = execFileSync(
    'docker',
    [
      'compose',
      '-f', dockerComposePath,
      '--project-directory', process.cwd(),
      '--project-name', config.dockerServiceName,
      'ps', '--all', '--format', 'json'
    ],
    { encoding: 'utf-8', cwd: process.cwd() }
  );

  return parseServiceStatus( result );
}

export function isServiceHealthy( service: ServiceStatus ): boolean {
  return service.state === SERVICE_STATE.RUNNING &&
    ( service.health === SERVICE_HEALTH.HEALTHY || service.health === SERVICE_HEALTH.NONE );
}

export function isServiceFailed( service: ServiceStatus ): boolean {
  return service.state === SERVICE_STATE.EXITED || service.health === SERVICE_HEALTH.UNHEALTHY;
}

export const STACK_STATE = {
  /** No containers exist for this project — a fresh start. */
  NONE: 'none',
  /** Every container is up and healthy — safe to attach and monitor. */
  RUNNING: 'running',
  /** Containers exist but some failed or are still coming up — reconcile. */
  PARTIAL: 'partial'
} as const;

export type StackState = typeof STACK_STATE[keyof typeof STACK_STATE];

/**
 * Classify the current state of a project's stack from `docker compose ps`.
 *
 * This is the detection signal `output dev` branches on: an empty result means
 * nothing is running (fresh start); an all-healthy result means we can attach
 * and monitor without touching the stack; anything in between (an exited
 * container, or services still booting) is reconciled with an idempotent
 * `up -d`. Scoped to the project name, so it never mistakes a foreign process
 * for one of ours the way a raw port probe does.
 */
export function classifyStackState( services: ServiceStatus[] ): StackState {
  if ( services.length === 0 ) {
    return STACK_STATE.NONE;
  }
  // Anything short of every service being healthy — a failed container or one
  // still booting — is PARTIAL and gets reconciled.
  if ( services.every( isServiceHealthy ) ) {
    return STACK_STATE.RUNNING;
  }
  return STACK_STATE.PARTIAL;
}

export async function waitForServicesHealthy(
  dockerComposePath: string,
  timeoutMs: number = 120000,
  pollIntervalMs: number = 2000
): Promise<void> {
  const startTime = Date.now();

  while ( Date.now() - startTime < timeoutMs ) {
    const services = await getServiceStatus( dockerComposePath );

    if ( services.length > 0 && services.every( isServiceHealthy ) ) {
      return;
    }

    await new Promise( resolve => setTimeout( resolve, pollIntervalMs ) );
  }

  throw new Error( 'Timeout waiting for services to become healthy' );
}

export interface DockerComposeHandlers {
  onError?: ( error: Error, output: string ) => void;
  onExit?: ( code: number | null, signal: NodeJS.Signals | null, output: string ) => void;
}

export type PullPolicy = 'always' | 'missing' | 'never';

export interface StartDockerComposeOptions extends DockerComposeHandlers {
  dockerComposePath: string;
  pullPolicy?: PullPolicy;
}

export async function startDockerCompose( {
  dockerComposePath,
  pullPolicy,
  onError,
  onExit
}: StartDockerComposeOptions ): Promise<ChildProcess> {
  const args = [
    'compose',
    '-f', dockerComposePath,
    '--project-directory', process.cwd(),
    '--project-name', config.dockerServiceName,
    'up'
  ];

  if ( pullPolicy ) {
    args.push( '--pull', pullPolicy );
  }

  const output = {
    value: ''
  };
  const appendOutput = ( chunk: Buffer ): void => {
    output.value = `${output.value}${chunk.toString()}`.slice( -20000 ).trimStart();
  };

  const dockerProcess = spawn( 'docker', args, {
    cwd: process.cwd(),
    // The Ink dev UI owns the terminal. Drain compose output so Docker cannot
    // block on a full pipe, while keeping recent output for startup failures.
    stdio: [ 'ignore', 'pipe', 'pipe' ]
  } );

  dockerProcess.stdout?.on( 'data', appendOutput );
  dockerProcess.stderr?.on( 'data', appendOutput );
  if ( onError ) {
    dockerProcess.on( 'error', error => onError( error, output.value.trimEnd() ) );
  }
  if ( onExit ) {
    dockerProcess.on( 'exit', ( code, signal ) => onExit( code, signal, output.value.trimEnd() ) );
  }

  return dockerProcess;
}

export function startDockerComposeDetached(
  dockerComposePath: string,
  pullPolicy?: PullPolicy
): void {
  const args = [
    'compose',
    '-f', dockerComposePath,
    '--project-directory', process.cwd(),
    '--project-name', config.dockerServiceName,
    'up', '-d'
  ];

  if ( pullPolicy ) {
    args.push( '--pull', pullPolicy );
  }

  execFileSync( 'docker', args, { stdio: 'inherit', cwd: process.cwd() } );
}

export async function stopDockerCompose( dockerComposePath: string ): Promise<void> {
  ux.stdout( '⏹️  Stopping services...\n' );
  execFileSync(
    'docker',
    [ 'compose', '-f', dockerComposePath, '--project-directory', process.cwd(), '--project-name', config.dockerServiceName, 'down' ],
    { stdio: 'inherit', cwd: process.cwd() }
  );
}

export { isDockerInstalled, DockerValidationError };
