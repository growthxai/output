import { Command, Flags } from '@oclif/core';
import { confirm } from '#utils/prompt.js';
import {
  fetchLatestVersion,
  getGlobalInstalledVersion,
  getLocalInstalledVersion,
  updateGlobal,
  updateLocal,
  isOutdated
} from '#services/npm_update_service.js';
import { ensureClaudePlugin } from '#services/coding_agents.js';
import { getErrorMessage } from '#utils/error_utils.js';

export default class Update extends Command {
  static description = 'Update Output CLI and agent configuration';

  static examples = [
    '<%= config.bin %> update',
    '<%= config.bin %> update --cli',
    '<%= config.bin %> update --agents'
  ];

  static flags = {
    cli: Flags.boolean( {
      description: 'Update CLI packages only'
    } ),
    agents: Flags.boolean( {
      description: 'Update Claude Code agent configuration'
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( Update );
    const updateAll = !flags.cli && !flags.agents;

    if ( updateAll || flags.cli ) {
      await this.updateCli();
    }

    if ( updateAll || flags.agents ) {
      await this.updateAgents();
    }
  }

  private async updateCli(): Promise<void> {
    const latest = await fetchLatestVersion();

    if ( !latest ) {
      this.error( 'Could not fetch the latest version from npm. Check your network connection.' );
    }

    this.log( `\nLatest @outputai/cli version: v${latest}\n` );

    await this.handleGlobalUpdate( latest );
    await this.handleLocalUpdate( latest );
  }

  private async updateAgents(): Promise<void> {
    this.log( '\nUpdating Claude Code agent configuration...' );

    try {
      await ensureClaudePlugin( process.cwd() );
      this.log( 'Claude Code agent configuration updated successfully.' );
    } catch ( error: unknown ) {
      this.warn( `Failed to update agent configuration: ${getErrorMessage( error )}` );
    }
  }

  private async handleGlobalUpdate( latest: string ): Promise<boolean> {
    const globalVersion = await getGlobalInstalledVersion();

    if ( !globalVersion ) {
      this.log( 'Global install: not found' );
      return false;
    }

    if ( !isOutdated( globalVersion, latest ) ) {
      this.log( `Global install: v${globalVersion} (up to date)` );
      return false;
    }

    this.log( `Global install: v${globalVersion} (outdated)` );

    const shouldUpdate = await confirm( {
      message: `Update global install from v${globalVersion} to v${latest}?`
    } );

    if ( !shouldUpdate ) {
      return false;
    }

    try {
      await updateGlobal();
      const newVersion = await getGlobalInstalledVersion();
      if ( newVersion ) {
        this.log( `\nGlobal install updated to v${newVersion}` );
      } else {
        this.log( '\nGlobal update completed (could not verify new version)' );
      }
      return true;
    } catch ( error: unknown ) {
      this.warn( `Failed to update global install: ${getErrorMessage( error )}` );
      return false;
    }
  }

  private async handleLocalUpdate( latest: string ): Promise<boolean> {
    const cwd = process.cwd();
    const localVersion = await getLocalInstalledVersion( cwd );

    if ( !localVersion ) {
      return false;
    }

    if ( !isOutdated( localVersion, latest ) ) {
      this.log( `\nLocal install: v${localVersion} (up to date)` );
      return false;
    }

    this.log( `\nLocal install: v${localVersion} (outdated)` );

    const shouldUpdate = await confirm( {
      message: `Update local install from v${localVersion} to v${latest}?`
    } );

    if ( !shouldUpdate ) {
      return false;
    }

    try {
      await updateLocal( cwd );
      const newLocalVersion = await getLocalInstalledVersion( cwd );

      if ( newLocalVersion ) {
        this.log( `\nLocal install updated to v${newLocalVersion}` );

        if ( isOutdated( newLocalVersion, latest ) ) {
          this.warn(
            `Your package.json constrains @outputai/output which limits @outputai/cli to v${newLocalVersion}. ` +
            'Update the @outputai/output version range in package.json to get the latest CLI.'
          );
        }
      } else {
        this.log( '\nLocal update completed (could not verify new version)' );
      }

      return true;
    } catch ( error: unknown ) {
      this.warn( `Failed to update local install: ${getErrorMessage( error )}` );
      return false;
    }
  }
}
