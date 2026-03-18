import { Command, Flags } from '@oclif/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import logUpdate from 'log-update';
import {
  validateDockerEnvironment,
  startDockerCompose,
  startDockerComposeDetached,
  stopDockerCompose,
  getServiceStatus,
  DockerComposeConfigNotFoundError,
  getDefaultDockerComposePath,
  SERVICE_HEALTH,
  SERVICE_STATE
} from '#services/docker.js';
import type { ServiceStatus, PullPolicy } from '#services/docker.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { getDevSuccessMessage } from '#services/messages.js';
import { ensureClaudePlugin } from '#services/coding_agents.js';

const ANSI = {
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
  BOLD: '\x1b[1m',
  CYAN: '\x1b[36m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BG_RED: '\x1b[41m',
  WHITE: '\x1b[37m'
} as const;

const STATUS_ICONS: Record<string, string> = {
  [SERVICE_HEALTH.HEALTHY]: '●',
  [SERVICE_HEALTH.UNHEALTHY]: '○',
  [SERVICE_HEALTH.STARTING]: '◐',
  [SERVICE_HEALTH.NONE]: '●',
  [SERVICE_STATE.RUNNING]: '●',
  [SERVICE_STATE.EXITED]: '✗'
};

const STATUS_COLORS: Record<string, string> = {
  [SERVICE_HEALTH.HEALTHY]: '\x1b[32m',
  [SERVICE_HEALTH.UNHEALTHY]: '\x1b[31m',
  [SERVICE_HEALTH.STARTING]: '\x1b[33m',
  [SERVICE_HEALTH.NONE]: '\x1b[34m',
  [SERVICE_STATE.RUNNING]: '\x1b[34m',
  [SERVICE_STATE.EXITED]: '\x1b[31m'
};

const formatService = ( service: ServiceStatus ): string => {
  const healthKey = service.health === SERVICE_HEALTH.NONE ? service.state : service.health;
  const icon = STATUS_ICONS[healthKey] || '?';
  const color = STATUS_COLORS[healthKey] || '';
  const ports = service.ports.length ? service.ports.join( ', ' ) : '-';
  const status = service.health === SERVICE_HEALTH.NONE ? service.state : service.health;
  const name = service.name.padEnd( 15 );
  const statusPadded = status.padEnd( 10 );
  return `  ${color}${icon}${ANSI.RESET} ${name} ${ANSI.DIM}${statusPadded}${ANSI.RESET} ${ANSI.DIM}${ports}${ANSI.RESET}`;
};

const getFailedServicesWarning = ( services: ServiceStatus[] ): string[] => {
  const failedServices = services.filter( s => s.state === SERVICE_STATE.EXITED );

  if ( failedServices.length === 0 ) {
    return [];
  }

  const failedNames = failedServices.map( s => s.name );
  const hasWorkerFailed = failedNames.some( name => name.toLowerCase().includes( 'worker' ) );

  const warningLines = [
    '',
    `${ANSI.BG_RED}${ANSI.WHITE}${ANSI.BOLD} ⚠️  SERVICE FAILURE DETECTED ${ANSI.RESET}`,
    '',
    `${ANSI.RED}${ANSI.BOLD}Failed services:${ANSI.RESET} ${failedNames.join( ', ' )}`
  ];

  if ( hasWorkerFailed ) {
    warningLines.push(
      '',
      `${ANSI.YELLOW}${ANSI.BOLD}⚡ The worker is not running!${ANSI.RESET}`,
      `${ANSI.YELLOW}   Workflows will fail until the worker is restarted.${ANSI.RESET}`,
      '',
      `${ANSI.DIM}Check the logs with: docker compose logs worker${ANSI.RESET}`
    );
  } else {
    warningLines.push(
      '',
      `${ANSI.DIM}Check the logs with: docker compose logs <service-name>${ANSI.RESET}`
    );
  }

  return warningLines;
};

const poll = async ( fn: () => Promise<void>, intervalMs: number ): Promise<never> => {
  for ( ;; ) {
    await fn();
    await new Promise( resolve => setTimeout( resolve, intervalMs ) );
  }
};

export default class Dev extends Command {
  static description = 'Start Output development services (auto-restarts worker on file changes)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --compose-file ./custom-docker-compose.yml',
    '<%= config.bin %> <%= command.id %> --image-pull-policy missing'
  ];

  static args = {};

  static flags = {
    'compose-file': Flags.string( {
      description: 'Path to a custom docker-compose file',
      required: false,
      char: 'f'
    } ),
    'image-pull-policy': Flags.string( {
      description: 'Image pull policy for docker compose (always, missing, never)',
      options: [ 'always', 'missing', 'never' ],
      default: 'always'
    } ),
    detached: Flags.boolean( {
      description: 'Start services in detached (background) mode and exit immediately',
      default: false,
      char: 'd'
    } )
  };

  private dockerProcess: ChildProcess | null = null;

  async run(): Promise<void> {
    const { flags } = await this.parse( Dev );

    // Ensure Claude plugin is configured (fire-and-forget, silent)
    ensureClaudePlugin( process.cwd(), { silent: true } ).catch( () => {} );

    validateDockerEnvironment();

    const dockerComposePath = flags['compose-file'] ?
      path.resolve( process.cwd(), flags['compose-file'] ) :
      getDefaultDockerComposePath();

    try {
      await fs.access( dockerComposePath );
    } catch {
      throw new DockerComposeConfigNotFoundError( dockerComposePath );
    }

    this.log( '\n🚀 Starting Output development services...\n' );

    if ( flags['compose-file'] ) {
      this.log( `Using custom docker-compose file: ${flags['compose-file']}\n` );
    }

    const pullPolicy = flags['image-pull-policy'] as PullPolicy;
    if ( flags.detached ) {
      this.log( '🐳 Starting services in detached mode...\n' );
      startDockerComposeDetached( dockerComposePath, pullPolicy );
      this.log( '✅ Services started. Run `output dev` without --detached to monitor status.\n' );
      return;
    }

    this.log( 'File watching enabled - worker will restart automatically on changes\n' );

    const cleanup = async () => {
      this.log( '\n' );
      if ( this.dockerProcess ) {
        this.dockerProcess.kill( 'SIGTERM' );
      }
      await stopDockerCompose( dockerComposePath );
      process.exit( 0 );
    };

    process.on( 'SIGINT', cleanup );
    process.on( 'SIGTERM', cleanup );

    try {
      const { process: dockerProc, waitForHealthy } = await startDockerCompose(
        dockerComposePath,
        pullPolicy
      );

      this.dockerProcess = dockerProc;

      dockerProc.on( 'error', error => {
        this.error( `Docker process error: ${getErrorMessage( error )}`, { exit: 1 } );
      } );

      this.log( '⏳ Waiting for services to become healthy...\n' );
      await waitForHealthy();

      const services = await getServiceStatus( dockerComposePath );
      this.log( getDevSuccessMessage( services ) );

      await this.pollServiceStatus( dockerComposePath );
    } catch ( error ) {
      this.error( getErrorMessage( error ), { exit: 1 } );
    }
  }

  private async pollServiceStatus( dockerComposePath: string ): Promise<void> {
    const outputServiceStatus = async (): Promise<void> => {
      try {
        const services = await getServiceStatus( dockerComposePath );
        const failureWarning = getFailedServicesWarning( services );

        const lines = [
          `${ANSI.BOLD}📊 Service Status${ANSI.RESET}`,
          '',
          ...services.map( formatService ),
          ...failureWarning,
          '',
          `${ANSI.CYAN}🌐 Temporal UI:${ANSI.RESET} ${ANSI.BOLD}http://localhost:8080${ANSI.RESET}`,
          '',
          `${ANSI.DIM}Press Ctrl+C to stop services${ANSI.RESET}`
        ];

        logUpdate( lines.join( '\n' ) );
      } catch {
        // silent retry on next poll
      }
    };

    await poll( outputServiceStatus, 2000 );
  }
}
