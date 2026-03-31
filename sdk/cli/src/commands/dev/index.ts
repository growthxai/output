import { Command, Flags } from '@oclif/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { render } from 'ink';
import React from 'react';
import {
  validateDockerEnvironment,
  startDockerCompose,
  startDockerComposeDetached,
  stopDockerCompose,
  DockerComposeConfigNotFoundError,
  getDefaultDockerComposePath
} from '#services/docker.js';
import type { PullPolicy } from '#services/docker.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { ensureClaudePlugin } from '#services/coding_agents.js';
import { DevApp } from '#views/dev.js';

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

    try {
      const { process: dockerProc } = await startDockerCompose(
        dockerComposePath,
        pullPolicy
      );

      this.dockerProcess = dockerProc;

      dockerProc.on( 'error', error => {
        this.error( `Docker process error: ${getErrorMessage( error )}`, { exit: 1 } );
      } );

      const instance = render(
        React.createElement( DevApp, { dockerComposePath, onCleanup: cleanup } ),
        { exitOnCtrlC: false }
      );

      const handleSignal = async () => {
        await cleanup();
        instance.unmount();
      };

      process.on( 'SIGINT', handleSignal );
      process.on( 'SIGTERM', handleSignal );

      await instance.waitUntilExit();
    } catch ( error ) {
      this.error( getErrorMessage( error ), { exit: 1 } );
    }
  }
}
