import { Hook, ux } from '@oclif/core';
import { checkForUpdate } from '#services/version_check.js';

const hook: Hook<'init'> = async function () {
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
