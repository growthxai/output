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
import { formatPortCollisionHint, formatPortCollisionsHint } from '#utils/port_collision.js';
import { findUnavailablePorts } from '#utils/port_availability.js';
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
    '  OUTPUT_TEMPORAL_UI_HOST_PORT=8081',
    '  OUTPUT_TEMPORAL_HOST_PORT=7234'
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

    // Probe each published host port before docker runs. docker compose up
    // doesn't exit on partial container failure, so a bind collision would
    // otherwise leave the Ink TUI in limbo with no actionable feedback.
    const takenPorts = await findUnavailablePorts( Object.values( config.ports ) );
    if ( takenPorts.length > 0 ) {
      this.error( formatPortCollisionsHint( takenPorts, config.ports ), { exit: 1 } );
    }

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

    const state = {
      cleaningUp: false
    };

    const cleanup = async () => {
      state.cleaningUp = true;
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

    // Single terminal-restore sequence shared by every exit path: stop Ink
    // (frees raw mode) then leave the alt-screen. The `finally` guarantees
    // the alt-screen is left even if `unmount()` throws — otherwise a crash
    // could strand the user in the blank alt buffer. This is the one place
    // the unmount → leave-alt-screen order lives, so the paths can't drift.
    const restoreTerminal = (): void => {
      try {
        instanceRef.current?.unmount();
      } finally {
        exitAltScreenOnce();
      }
    };

    // Collect a disposer for every process listener so registration and
    // teardown can't drift: a handler added through `on` is always removed by
    // the `finally` below, with no separate removeListener list to keep in sync.
    const disposers: Array<() => void> = [];
    const on = ( event: string, handler: ( ...args: unknown[] ) => void ): void => {
      process.on( event, handler );
      disposers.push( () => process.removeListener( event, handler ) );
    };

    on( 'exit', exitAltScreenOnce );

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
        .finally( restoreTerminal );
    };

    on( 'SIGINT', handleSignal );
    on( 'SIGTERM', handleSignal );

    // A fatal crash (uncaught exception / unhandled rejection) skips both the
    // clean-exit path and the signal handlers. Tear docker down via cleanup()
    // FIRST, then restore the terminal and print the crash: unmounting Ink
    // resolves the awaited waitUntilExit(), which resumes run() and strips the
    // signal listeners — so unmounting before cleanup would drop them
    // mid-teardown and let a Ctrl+C orphan the stack. Print the raw error so
    // Node's stack trace survives, then re-exit non-zero. Fire-once: a second
    // catchable crash during teardown is a no-op. A hard V8 abort() (SIGABRT)
    // is uncatchable and not covered here. The object wrapper holds the
    // fire-once flag because the linter forbids `let` (same idiom as
    // exitAltScreenOnce above).
    const fatalState = { handled: false };
    const handleFatalError = ( err: unknown ): void => {
      if ( fatalState.handled ) {
        return;
      }
      fatalState.handled = true;
      cleanup()
        .catch( cleanupErr => console.error( 'Cleanup failed:', getErrorMessage( cleanupErr ) ) )
        .finally( () => {
          restoreTerminal();
          console.error( err );
          process.exit( 1 );
        } );
    };

    on( 'uncaughtException', handleFatalError );
    on( 'unhandledRejection', handleFatalError );

    try {
      enterAltScreen();

      const instance = render(
        React.createElement( DevApp, { dockerComposePath, onCleanup: cleanup } ),
        { exitOnCtrlC: false }
      );
      instanceRef.current = instance;

      const dockerProc = await startDockerCompose( {
        dockerComposePath,
        pullPolicy,
        onError: error => {
          instance.unmount( new Error( `Docker process error: ${getErrorMessage( error )}` ) );
        },
        onExit: ( code, signal, output ) => {
          if ( state.cleaningUp ) {
            return;
          }
          if ( code === 0 ) {
            instance.unmount();
            return;
          }

          const exitReason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
          const hint = formatPortCollisionHint( output, config.ports );
          const prefix = hint ? `${hint}\n\n` : '';
          const detail = output ? `\n\nRecent Docker output:\n${output}` : '';
          instance.unmount( new Error( `${prefix}Docker compose exited with ${exitReason}.${detail}` ) );
        }
      } );

      this.dockerProcess = dockerProc;

      await instance.waitUntilExit();
      exitAltScreenOnce();
    } catch ( error ) {
      restoreTerminal();
      this.error( getErrorMessage( error ), { exit: 1 } );
    } finally {
      // Remove every process-global listener registered above; otherwise each
      // run() (test invocations included) leaks a live handler that force-
      // exits the process on the next stray signal or rejection.
      disposers.forEach( dispose => dispose() );
    }
  }
}
