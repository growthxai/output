import { execFileSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ux } from '@oclif/core';
import semver from 'semver';
import { config } from '#config.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { formatComposeFailure } from '#utils/port_collision.js';

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
  /** Nothing live for this project — a fresh start we own. */
  NONE: 'none',
  /** Every container found is running and healthy (or has no healthcheck). */
  RUNNING: 'running',
  /** Something is live but not everything is healthy — reconcile. */
  PARTIAL: 'partial'
} as const;

export type StackState = typeof STACK_STATE[keyof typeof STACK_STATE];

/**
 * Classify the current state of a project's stack from `docker compose ps`.
 *
 * This is the detection signal `output dev` branches on: nothing live means a
 * fresh start; an all-healthy result means we can attach and monitor without
 * touching the stack; anything in between is reconciled with `up -d`.
 *
 * Scoped to the shared `output-sdk` compose project, which distinguishes our
 * containers from unrelated processes — but not one Output checkout from
 * another, since the project name defaults to a machine-global constant.
 */
export function classifyStackState( services: ServiceStatus[] ): StackState {
  // No container is live. `ps --all` also reports exited ones, so a stack left
  // behind by a reboot, a `docker compose stop`, or a failed teardown lands
  // here — that's an owned fresh start, not something to attach to.
  if ( !services.some( service => service.state === SERVICE_STATE.RUNNING ) ) {
    return STACK_STATE.NONE;
  }
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

// A rolling buffer that retains the last ~20k chars of a spawned process's
// combined output, so a startup failure can surface recent Docker logs without
// holding the whole stream. Shared by the two compose spawn sites.
function createOutputBuffer(): { append: ( chunk: Buffer ) => void; read: () => string } {
  const buffer = { value: '' };
  return {
    append: ( chunk: Buffer ): void => {
      buffer.value = `${buffer.value}${chunk.toString()}`.slice( -20000 ).trimStart();
    },
    read: (): string => buffer.value.trimEnd()
  };
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

  const output = createOutputBuffer();

  const dockerProcess = spawn( 'docker', args, {
    cwd: process.cwd(),
    // The Ink dev UI owns the terminal. Drain compose output so Docker cannot
    // block on a full pipe, while keeping recent output for startup failures.
    stdio: [ 'ignore', 'pipe', 'pipe' ]
  } );

  dockerProcess.stdout?.on( 'data', output.append );
  dockerProcess.stderr?.on( 'data', output.append );
  if ( onError ) {
    dockerProcess.on( 'error', error => onError( error, output.read() ) );
  }
  if ( onExit ) {
    // `close` rather than `exit` so stdio has drained — the buffered output is
    // what formatComposeFailure greps for a bind failure.
    dockerProcess.on( 'close', ( code, signal ) => onExit( code, signal, output.read() ) );
  }

  return dockerProcess;
}

export interface DetachedUpResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}

// Run `docker compose up -d` to completion, teeing Docker's progress to the
// user's terminal while retaining recent output. The predecessor used
// execFileSync with inherited stdio, which threw a raw compose error the caller
// couldn't inspect; returning the exit code and output lets it surface a
// port-collision hint instead. Async so image pulls don't block the event loop.
//
// Trade-off: piping means Docker sees a non-TTY and drops its redrawing
// progress bars for plain scrolling lines.
export function runDockerComposeUpDetached(
  dockerComposePath: string,
  pullPolicy?: PullPolicy
): Promise<DetachedUpResult> {
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

  const output = createOutputBuffer();

  return new Promise( ( resolve, reject ) => {
    // Pipe rather than inherit so we can both echo Docker's progress and keep
    // recent output for a startup-failure hint.
    const child = spawn( 'docker', args, {
      cwd: process.cwd(),
      stdio: [ 'ignore', 'pipe', 'pipe' ]
    } );

    child.stdout?.on( 'data', ( chunk: Buffer ) => {
      process.stdout.write( chunk );
      output.append( chunk );
    } );
    child.stderr?.on( 'data', ( chunk: Buffer ) => {
      process.stderr.write( chunk );
      output.append( chunk );
    } );

    // `error` fires when the spawn itself failed (docker missing, EACCES).
    // Reject with the buffered output attached so the caller keeps the context
    // rather than surfacing a bare `spawn docker ENOENT`.
    child.on( 'error', error => {
      reject( new Error( formatComposeFailure( getErrorMessage( error ), output.read(), config.ports ) ) );
    } );
    // `close`, not `exit`: exit fires while stdio may still be draining, and on
    // a fast-failing `up -d` — exactly the bind-collision case — the stderr
    // chunk carrying the bind error can land after it. Resolving early makes
    // the port-collision hint disappear intermittently.
    child.on( 'close', ( code, signal ) => resolve( { code, signal, output: output.read() } ) );
  } );
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
