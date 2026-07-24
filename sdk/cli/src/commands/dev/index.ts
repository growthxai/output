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
import type { PullPolicy, ServiceStatus } from '#services/docker.js';
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
    'to monitor them rather than treating our own containers as a port collision.',
    'Quitting an attached session leaves the services running — stop them with',
    '`output dev down`.',
    '',
    'To run a second dev stack concurrently, give it its own compose project and',
    'host ports in .env — without DOCKER_SERVICE_NAME both checkouts share one',
    'stack, and the second will attach to the first instead of starting:',
    '',
    '  DOCKER_SERVICE_NAME=output-sdk-two',
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
      // Probe only for a fresh start, same rule as the foreground path — our own
      // running containers must not read as a collision. Compose alone isn't
      // enough of a check: on Docker Desktop for macOS (verified on 29.4.0) a
      // non-container process holding a published port doesn't fail `up -d` at
      // all — the container starts and that port keeps answering the other
      // process. The probe is the only thing that catches it there.
      await this.probePortsIfFreshStart( dockerComposePath );
      await this.upDetachedOrError( dockerComposePath, pullPolicy );
      this.log( '✅ Services started. Run `output dev` without --detached to monitor status.\n' );
      return;
    }

    // Detect an existing stack for this project so a re-run attaches instead of
    // colliding. A raw port probe can't tell our own running containers from a
    // foreign process; `docker compose ps` can — though only within the shared
    // compose project name, which doesn't separate one checkout from another.
    const existingServices = await this.getServiceStatusOrWarn( dockerComposePath );
    const stackState = classifyStackState( existingServices );

    if ( stackState === STACK_STATE.NONE ) {
      await this.probePorts();
    } else if ( stackState === STACK_STATE.PARTIAL ) {
      // Reconcile: converge a stack that's up but incomplete to the compose
      // spec, then monitor. Inspected (not fire-and-forget) so a failed bind
      // surfaces the same actionable port-collision hint the fresh-start path
      // gives. Recovers the OUT-477 orphaned-stack case.
      this.log( '🔄 Existing services detected — reconciling before attaching...\n' );
      await this.upDetachedOrError( dockerComposePath, pullPolicy );
    } else {
      this.log( '🔗 Services already running — attaching to monitor.\n' );
    }

    // We own the stack only when we started it ourselves. Attaching to (or
    // reconciling) a stack the user already had running leaves it up on quit.
    const ownsStack = stackState === STACK_STATE.NONE;

    if ( !ownsStack ) {
      // The stack outliving this session is the surprising half of attach mode,
      // and neither log line above says so. State the consequence plainly —
      // container state alone can't tell a backgrounded `-d` stack from a
      // crashed foreground session, so we can't infer intent, only report it.
      this.log( 'Quitting leaves these services running — stop them with `output dev down`.\n' );
    }

    const state = {
      cleaningUp: false
    };

    // Only an invocation that started the stack owns its teardown; attach and
    // reconcile sessions leave it running. Both the signal-driven cleanup and
    // the abnormal-exit catch route through here so the rule lives in one place.
    const teardownIfOwned = async () => {
      if ( !ownsStack ) {
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
        React.createElement( DevApp, { dockerComposePath, onCleanup: cleanup, attached: !ownsStack } ),
        { exitOnCtrlC: false }
      );
      instanceRef.current = instance;

      // Attach mode monitors via `docker compose ps` polling (inside DevApp) —
      // it must not own a foreground `up`, which stops the whole project on exit.
      if ( ownsStack ) {
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

  // Probe each published host port before docker runs. Compose won't collide
  // with its own containers, but a foreign process on one of these ports would
  // leave the Ink TUI in limbo (or, detached, produce a container nobody can
  // reach), so surface it now with an actionable hint.
  private async probePorts(): Promise<void> {
    const takenPorts = await findUnavailablePorts( Object.values( config.ports ) );
    if ( takenPorts.length > 0 ) {
      this.error( formatPortCollisionsHint( takenPorts, config.ports ), { exit: 1 } );
    }
  }

  // Probe only when no container of ours is live — otherwise our own stack is
  // legitimately holding the ports and a probe would abort on it, which is the
  // OUT-477 failure this detection replaced.
  private async probePortsIfFreshStart( dockerComposePath: string ): Promise<void> {
    const services = await this.getServiceStatusOrWarn( dockerComposePath );
    if ( classifyStackState( services ) === STACK_STATE.NONE ) {
      await this.probePorts();
    }
  }

  // Query the stack, falling back to "nothing running" when the query itself
  // fails. A fresh start is the right recovery, but [] is not a neutral default
  // — it asserts "no containers exist", which every caller acts on. Announce it,
  // or a broken `ps` silently port-probes onto the user's own containers and
  // reproduces the exact OUT-477 message this detection replaced, with a remedy
  // (change the port) that is wrong for the actual cause.
  private async getServiceStatusOrWarn( dockerComposePath: string ): Promise<ServiceStatus[]> {
    return getServiceStatus( dockerComposePath ).catch( ( error: unknown ) => {
      this.warn(
        `Could not query existing services (${getErrorMessage( error )}). ` +
        'Continuing as a fresh start — if services are already running, stop them ' +
        'with `output dev down` first.'
      );
      return [];
    } );
  }

  // Bring the stack up detached and fail with an actionable message if compose
  // couldn't launch it (most often a foreign process holding a published
  // port). Shared by the `--detached` flag and the PARTIAL reconcile branch so
  // both surface the port-collision hint instead of a raw compose error.
  private async upDetachedOrError( dockerComposePath: string, pullPolicy: PullPolicy ): Promise<void> {
    const { code, signal, output } = await runDockerComposeUpDetached( dockerComposePath, pullPolicy );
    if ( code === 0 ) {
      return;
    }

    // A signalled compose (an OOM-killed pull, a SIGKILL) has no exit code —
    // report the signal rather than "unknown", which discards a known cause.
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
    this.error(
      formatComposeFailure(
        `Docker compose failed to start services (${reason}). ` +
        'Some containers may have started — stop them with `output dev down`.',
        output,
        config.ports
      ),
      { exit: 1 }
    );
  }
}
