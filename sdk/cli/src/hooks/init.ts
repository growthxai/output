import { Hook, ux } from '@oclif/core';
import { checkForUpdate } from '#services/version_check.js';
import { setNonInteractive } from '#utils/interactive.js';

const GLOBAL_FLAGS = new Set( [ '--yes', '--non-interactive' ] );

// Strip global flags from an argv array IN PLACE. oclif threads the same
// array reference from its init hook into the command parser, so a splice
// here removes the flags before the per-command strict validator sees them.
// Reassignment (`argv = argv.filter(...)`) would break that shared reference.
const stripGlobalFlags = ( argv: string[] ): boolean => {
  const kept = argv.filter( arg => !GLOBAL_FLAGS.has( arg ) );
  if ( kept.length === argv.length ) {
    return false;
  }
  argv.splice( 0, argv.length, ...kept );
  return true;
};

const hook: Hook<'init'> = async function ( opts ) {
  const strippedFromOpts = stripGlobalFlags( opts.argv );
  const strippedFromProcess = stripGlobalFlags( process.argv );

  if ( strippedFromOpts || strippedFromProcess ) {
    setNonInteractive( true );
  }

  try {
    const result = await checkForUpdate( this.config.version, this.config.cacheDir );

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
