import { Hook, ux } from '@oclif/core';
import { readCachedResult, spawnBackgroundRefresh } from '#services/version_check.js';
import { setNonInteractive } from '#utils/interactive.js';

export const INTERACTIVE_FLAGS = [ '--yes', '--non-interactive' ];

export const GLOBAL_FLAGS = new Set<string>( INTERACTIVE_FLAGS );

export const hasInteractiveFlag = ( argv: string[] ): boolean =>
  argv.some( arg => INTERACTIVE_FLAGS.includes( arg ) );

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

    const border = ux.colorize( 'dim', '─'.repeat( 80 ) );
    const warning = ux.colorize( 'yellow', 'Uhoh! Your Output.ai CLI is behind!' );
    const latestVer = ux.colorize( 'green', `v${result.latestVersion}` );
    const currentVer = ux.colorize( 'yellow', `v${result.currentVersion}` );
    const updateCmd = ux.colorize( 'cyan', 'npx output update' );

    ux.stdout( '' );
    ux.stdout( border );
    ux.stdout( '' );
    ux.stdout( `  ⚠️  ${warning}` );
    ux.stdout( '' );
    ux.stdout( `     Latest is ${latestVer}, and you're using ${currentVer}` );
    ux.stdout( '' );
    ux.stdout( `     Run \`${updateCmd}\` to update` );
    ux.stdout( '' );
    ux.stdout( border );
    ux.stdout( '' );
  } catch {
    // Never block CLI execution
  }
};

export default hook;
