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
import { config } from '#config.js';

export default class Dev extends Command {
  static description = [
    'Start Output development services (auto-restarts worker on file changes)',
    '',
    'To run a second dev stack concurrently, override host ports in .env:',
    '',
    '  OUTPUT_API_HOST_PORT=3002',
    '  OUTPUT_TEMPORAL_UI_HOST_PORT=8081'
  ].join( '\n' );

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

    // Eagerly resolve ports so InvalidPortError surfaces before Ink mounts.
    void config.ports;

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

    // INK paints onto the alternate screen buffer so log-update has a
    // fixed-height canvas and doesn't scroll old frames into the user's
    // scrollback when the rendered tree exceeds the visible terminal rows.
    const enterAltScreen = (): void => {
      process.stdout.write( '\x1b[?1049h\x1b[2J\x1b[H' );
    };
    const exitAltScreen = (): void => {
      process.stdout.write( '\x1b[?1049l' );
    };
    // Idempotent so repeated SIGINTs / process.exit don't re-emit the leave
    // sequence (which produces visible garbage in some terminals).
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

    // Register cleanup before anything that can throw or get signaled. The
    // `instance` ref is filled in once `render()` returns; until then,
    // signal handlers just stop docker and exit.
    const instanceRef: { current: ReturnType<typeof render> | null } = { current: null };

    process.on( 'exit', exitAltScreenOnce );

    // `process.on` doesn't await the handler, so the cleanup promise would
    // float and any rejection would surface as an unhandled rejection.
    // Wrap the async work in a sync registration that explicitly logs
    // failures and always unmounts Ink afterwards. Exit the alt-screen
    // first inside the catch — Ink still owns the alt-buffer until
    // `unmount()` runs, so a bare `console.error` would paint into a
    // buffer the user never sees.
    const handleSignal = (): void => {
      cleanup()
        .catch( err => {
          exitAltScreenOnce();
          console.error( 'Cleanup failed:', getErrorMessage( err ) );
        } )
        .finally( () => instanceRef.current?.unmount() );
    };

    process.on( 'SIGINT', handleSignal );
    process.on( 'SIGTERM', handleSignal );

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
      instanceRef.current = instance;

      dockerProc.on( 'error', error => {
        instance.unmount( new Error( `Docker process error: ${getErrorMessage( error )}` ) );
      } );

      await instance.waitUntilExit();
      exitAltScreenOnce();
    } catch ( error ) {
      exitAltScreenOnce();
      this.error( getErrorMessage( error ), { exit: 1 } );
    }
  }
}
