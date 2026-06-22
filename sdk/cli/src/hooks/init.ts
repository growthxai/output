import { Hook, ux } from '@oclif/core';
import debugFactory from 'debug';
import { readCachedResult, spawnBackgroundRefresh } from '#services/version_check.js';
import { setNonInteractive } from '#utils/interactive.js';

const debug = debugFactory( 'output-cli:init' );

export const INTERACTIVE_FLAGS = [ '--yes', '--non-interactive' ];

export const GLOBAL_FLAGS = new Set<string>( INTERACTIVE_FLAGS );

export const hasInteractiveFlag = ( argv: string[] ): boolean =>
  argv.some( arg => INTERACTIVE_FLAGS.includes( arg ) );

// The version banner must never reach stdout in JSON mode, where it would
// corrupt the machine-readable output. oclif only suppresses `this.log` inside
// the command, not hook output, so we detect `--json` ourselves.
export const hasJsonFlag = ( argv: string[] ): boolean =>
  argv.includes( '--json' );

export const stripGlobalFlags = ( argv: string[] ): void => {
  const kept = argv.filter( arg => !GLOBAL_FLAGS.has( arg ) );
  if ( kept.length !== argv.length ) {
    argv.splice( 0, argv.length, ...kept );
  }
};

const hook: Hook<'init'> = async function ( opts ) {
  const interactive = hasInteractiveFlag( opts.argv ) || hasInteractiveFlag( process.argv );

  stripGlobalFlags( opts.argv );
  stripGlobalFlags( process.argv );

  if ( interactive ) {
    setNonInteractive( true );
  }

  try {
    // Only the local cache is read here; the registry roundtrip happens in a
    // detached child so it never delays the invoked command.
    const result = await readCachedResult( this.config.version, this.config.cacheDir );

    if ( !result ) {
      spawnBackgroundRefresh( this.config.version, this.config.cacheDir );
      return;
    }

    if ( !result.updateAvailable ) {
      return;
    }

    // Skip the banner entirely in JSON mode: even on stderr it is pure noise to
    // a script consuming the command's structured output.
    if ( hasJsonFlag( opts.argv ) || hasJsonFlag( process.argv ) ) {
      return;
    }

    const border = ux.colorize( 'dim', '─'.repeat( 80 ) );
    const warning = ux.colorize( 'yellow', 'Uhoh! Your Output.ai CLI is behind!' );
    const latestVer = ux.colorize( 'green', `v${result.latestVersion}` );
    const currentVer = ux.colorize( 'yellow', `v${result.currentVersion}` );
    const updateCmd = ux.colorize( 'cyan', 'npx output update' );

    // Advisory notice goes to stderr so stdout stays clean for piping in every mode.
    ux.stderr( '' );
    ux.stderr( border );
    ux.stderr( '' );
    ux.stderr( `  ⚠️  ${warning}` );
    ux.stderr( '' );
    ux.stderr( `     Latest is ${latestVer}, and you're using ${currentVer}` );
    ux.stderr( '' );
    ux.stderr( `     Run \`${updateCmd}\` to update` );
    ux.stderr( '' );
    ux.stderr( border );
    ux.stderr( '' );
  } catch ( error ) {
    // Never block CLI execution
    debug( 'Version banner failed: %O', error );
  }
};

export default hook;
