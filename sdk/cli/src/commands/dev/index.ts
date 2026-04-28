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
import { DevApp } from '#views/dev/dev_app.js';

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

    const pullPolicy = flags['image-pull-policy'] as PullPolicy;
    if ( flags.detached ) {
      this.log( '🐳 Starting services in detached mode...\n' );
      startDockerComposeDetached( dockerComposePath, pullPolicy );
      this.log( '✅ Services started. Run `output dev` without --detached to monitor status.\n' );
      return;
    }

    const cleanup = async () => {
      this.log( '\n' );
      if ( this.dockerProcess ) {
        this.dockerProcess.kill( 'SIGTERM' );
      }
      await stopDockerCompose( dockerComposePath );
    };

    // Use the alternate screen buffer so INK has a fixed-height canvas and
    // log-update doesn't scroll old frames into scrollback when the TUI is
    // taller than the terminal window.
    const enterAltScreen = (): void => {
      process.stdout.write( '\x1b[?1049h\x1b[2J\x1b[H' );
    };
    const exitAltScreen = (): void => {
      process.stdout.write( '\x1b[?1049l' );
    };
    const exitAltScreenOnce = ( () => {
      const state = { fired: false };
      return (): void => {
        if ( state.fired ) {
          return;
        }
        state.fired = true;
        exitAltScreen();
      };
    } )();

    process.on( 'exit', exitAltScreenOnce );

    try {
      const { process: dockerProc } = await startDockerCompose(
        dockerComposePath,
        pullPolicy
      );

      this.dockerProcess = dockerProc;

      enterAltScreen();

      const instance = render(
        React.createElement( DevApp, { dockerComposePath, onCleanup: cleanup } ),
        { exitOnCtrlC: false }
      );

      dockerProc.on( 'error', error => {
        instance.unmount( new Error( `Docker process error: ${getErrorMessage( error )}` ) );
      } );

      const handleSignal = async () => {
        await cleanup();
        instance.unmount();
      };

      process.on( 'SIGINT', handleSignal );
      process.on( 'SIGTERM', handleSignal );

      await instance.waitUntilExit();
      exitAltScreenOnce();
    } catch ( error ) {
      exitAltScreenOnce();
      this.error( getErrorMessage( error ), { exit: 1 } );
    }
  }
}
