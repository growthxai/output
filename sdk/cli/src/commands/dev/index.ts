import { Command, Flags } from '@oclif/core';
import type { ChildProcess } from 'node:child_process';
import { render } from 'ink';
import React from 'react';
import {
  validateDockerEnvironment,
  startDockerCompose,
  runDockerComposeUpDetached,
  stopDockerCompose,
  getServiceStatus,
  classifyStackState,
  STACK_STATE,
  resolveDockerComposePath
} from '#services/docker.js';
import type { PullPolicy } from '#services/docker.js';
import { getErrorMessage } from '#utils/error_utils.js';
import { formatComposeFailure, formatPortCollisionsHint } from '#utils/port_collision.js';
import { findUnavailablePorts } from '#utils/port_availability.js';
import { ensureClaudePlugin } from '#services/coding_agents.js';
import { DevApp } from '#views/dev/dev_app.js';
import { config } from '#config.js';

export default class Dev extends Command {
  static description = [
    'Start Output development services (auto-restarts worker on file changes)',
    '',
    'If services are already running (e.g. after `output dev -d`), this attaches',
    'to monitor them instead of failing on a port collision. Quitting an attached',
    'session leaves the services running — stop them with `output dev down`.',
    '',
    'To run a second dev stack concurrently, override host ports in .env:',
    '',
    '  OUTPUT_API_HOST_PORT=3002',
    '  OUTPUT_TEMPORAL_UI_HOST_PORT=8081',
    '  OUTPUT_TEMPORAL_HOST_PORT=7234'
  ].join( '\n' );

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --detached',
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

    const dockerComposePath = await resolveDockerComposePath( flags['compose-file'] );

    const pullPolicy = flags['image-pull-policy'] as PullPolicy;
    if ( flags.detached ) {
      this.log( '🐳 Starting services in detached mode...\n' );
      await this.upDetachedOrError( dockerComposePath, pullPolicy );
      this.log( '✅ Services started. Run `output dev` without --detached to monitor status.\n' );
      return;
    }

    // Detect an existing stack for this project (scoped by compose project
    // name) so a re-run attaches instead of colliding. A raw port probe can't
    // tell our own running containers from a foreign process; `docker compose
    // ps` can. Fall back to a fresh start if the query itself fails.
    const existingServices = await getServiceStatus( dockerComposePath ).catch( () => [] );
    const stackState = classifyStackState( existingServices );

    if ( stackState === STACK_STATE.NONE ) {
      // Fresh start: probe each published host port before docker runs.
      // Compose won't collide with its own containers, but a foreign process
      // on one of these ports would leave the Ink TUI in limbo, so surface it
      // now with an actionable hint.
      const takenPorts = await findUnavailablePorts( Object.values( config.ports ) );
      if ( takenPorts.length > 0 ) {
        this.error( formatPortCollisionsHint( takenPorts, config.ports ), { exit: 1 } );
      }
    } else if ( stackState === STACK_STATE.PARTIAL ) {
      // Reconcile: recreate failed or missing containers in the background,
      // then monitor. `up -d` is idempotent and leaves healthy containers
      // untouched, so this cleanly recovers the OUT-477 orphaned-stack case.
      // Inspected (not fire-and-forget) so a failed bind surfaces the same
      // actionable port-collision hint the fresh-start path gives.
      this.log( '🔄 Existing services detected — reconciling before attaching...\n' );
      await this.upDetachedOrError( dockerComposePath, pullPolicy );
    } else {
      this.log( '🔗 Services already running — attaching to monitor.\n' );
    }

    // True whenever we didn't start the stack ourselves — an attach or a
    // reconcile of a stack the user backgrounded. Drives teardown ownership,
    // the foreground `up`, and the UI hint.
    const attachOnly = stackState !== STACK_STATE.NONE;

    const state = {
      cleaningUp: false
    };

    // Only an invocation that started the stack in the foreground owns its
    // teardown; attach/reconcile sessions leave it running (`output dev down`
    // stops it). A foreground `up` stops the whole project on exit, so attach
    // mode never runs one. Both the signal-driven cleanup and the abnormal-exit
    // catch route through here so the ownership rule lives in one place.
    const teardownIfOwned = async () => {
      if ( attachOnly ) {
        return;
      }
      if ( this.dockerProcess ) {
        this.dockerProcess.kill( 'SIGTERM' );
      }
      await stopDockerCompose( dockerComposePath );
    };

    const cleanup = async () => {
      state.cleaningUp = true;
      this.log( '\n' );
      await teardownIfOwned();
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
      enterAltScreen();

      const instance = render(
        React.createElement( DevApp, { dockerComposePath, onCleanup: cleanup, attached: attachOnly } ),
        { exitOnCtrlC: false }
      );
      instanceRef.current = instance;

      // Attach mode monitors an existing stack via `docker compose ps` polling
      // (handled inside DevApp) — it must not own a foreground `up`, which
      // would stop the whole project on exit.
      if ( !attachOnly ) {
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
            instance.unmount( new Error(
              formatComposeFailure( `Docker compose exited with ${exitReason}.`, output, config.ports )
            ) );
          }
        } );

        this.dockerProcess = dockerProc;
      }

      await instance.waitUntilExit();
      exitAltScreenOnce();
    } catch ( error ) {
      instanceRef.current?.unmount();
      exitAltScreenOnce();
      // An abnormal exit (health timeout, docker crash) resolves outside the
      // signal path. Tear down here only if cleanup hasn't already run, so an
      // owned stack never leaks containers holding ports — the OUT-477 root
      // cause. teardownIfOwned no-ops for attach/reconcile sessions.
      if ( !state.cleaningUp ) {
        await teardownIfOwned().catch( teardownError => {
          // Don't mask the original failure, but the stack may still be up
          // holding ports — tell the user how to stop it.
          this.warn(
            'Failed to stop services during cleanup — they may still be running. ' +
            `Stop them with \`output dev down\`.\n${getErrorMessage( teardownError )}`
          );
        } );
      }
      this.error( getErrorMessage( error ), { exit: 1 } );
    }
  }

  // Bring the stack up detached and fail with an actionable message if compose
  // couldn't launch it (most often a foreign process holding a published
  // port). Shared by the `--detached` flag and the PARTIAL reconcile branch so
  // both surface the port-collision hint instead of a raw compose error.
  private async upDetachedOrError( dockerComposePath: string, pullPolicy: PullPolicy ): Promise<void> {
    const { code, output } = await runDockerComposeUpDetached( dockerComposePath, pullPolicy );
    if ( code === 0 ) {
      return;
    }

    this.error(
      formatComposeFailure(
        `Docker compose failed to start services (exit code ${code ?? 'unknown'}).`,
        output,
        config.ports
      ),
      { exit: 1 }
    );
  }
}
