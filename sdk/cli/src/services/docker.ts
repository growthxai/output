import { execFileSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ux } from '@oclif/core';

const DEFAULT_COMPOSE_PATH = '../assets/docker/docker-compose-dev.yml';

export const SERVICE_HEALTH = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  STARTING: 'starting',
  NONE: 'none'
} as const;

export const SERVICE_STATE = {
  RUNNING: 'running',
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

const parseSemver = ( version: string ): [number, number, number] | null => {
  const match = version.match( /^(\d+)\.(\d+)\.(\d+)/ );
  return match ? [ Number( match[1] ), Number( match[2] ), Number( match[3] ) ] : null;
};

const satisfiesSemver = ( version: string, range: string ): boolean => {
  if ( range === '*' ) {
    return true;
  }

  const gteMatch = range.match( /^>=(.+)$/ );
  if ( !gteMatch ) {
    return false;
  }

  const current = parseSemver( version );
  const required = parseSemver( gteMatch[1] );
  if ( !current || !required ) {
    return false;
  }

  const [ currentMajor, currentMinor, currentPatch ] = current;
  const [ requiredMajor, requiredMinor, requiredPatch ] = required;

  if ( currentMajor !== requiredMajor ) {
    return currentMajor > requiredMajor;
  }
  if ( currentMinor !== requiredMinor ) {
    return currentMinor > requiredMinor;
  }
  return currentPatch >= requiredPatch;
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
    const version = prereq.getVersion();

    if ( version === null ) {
      throw new DockerValidationError( prereq.errorMessage( null, prereq.semverRange ) );
    }

    if ( !satisfiesSemver( version, prereq.semverRange ) ) {
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
    [ 'compose', '-f', dockerComposePath, 'ps', '--all', '--format', 'json' ],
    { encoding: 'utf-8', cwd: process.cwd() }
  );

  return parseServiceStatus( result );
}

export function isServiceHealthy( service: ServiceStatus ): boolean {
  return service.state !== SERVICE_STATE.EXITED &&
    ( service.health === SERVICE_HEALTH.HEALTHY || service.health === SERVICE_HEALTH.NONE );
}

export function isServiceFailed( service: ServiceStatus ): boolean {
  return service.state === SERVICE_STATE.EXITED || service.health === SERVICE_HEALTH.UNHEALTHY;
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

export interface DockerComposeProcess {
  process: ChildProcess;
}

export type PullPolicy = 'always' | 'missing' | 'never';

export async function startDockerCompose(
  dockerComposePath: string,
  pullPolicy?: PullPolicy
): Promise<DockerComposeProcess> {
  const args = [
    'compose',
    '-f', dockerComposePath,
    '--project-directory', process.cwd(),
    'up'
  ];

  if ( pullPolicy ) {
    args.push( '--pull', pullPolicy );
  }

  ux.stdout( '🐳 Starting Docker services...\n' );

  const dockerProcess = spawn( 'docker', args, {
    cwd: process.cwd(),
    stdio: [ 'ignore', 'pipe', 'pipe' ]
  } );

  return { process: dockerProcess };
}

export function startDockerComposeDetached(
  dockerComposePath: string,
  pullPolicy?: PullPolicy
): void {
  const args = [
    'compose',
    '-f', dockerComposePath,
    '--project-directory', process.cwd(),
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
    [ 'compose', '-f', dockerComposePath, 'down' ],
    { stdio: 'inherit', cwd: process.cwd() }
  );
}

export { isDockerInstalled, DockerValidationError };
