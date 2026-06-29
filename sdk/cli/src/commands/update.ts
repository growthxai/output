import { Command, Flags } from '@oclif/core';
import { confirm } from '#utils/prompt.js';
import {
  fetchLatestVersion,
  DEPRECATED_WRAPPER_PACKAGE_WARNING,
  getGlobalInstalledVersion,
  hasDeprecatedWrapperPackage,
  getLocalInstalledPackages,
  getLocalInstalledVersion,
  updateGlobal,
  updateLocal,
  updateLocalPackages,
  isOutdated,
  type LocalInstalledPackage
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
      this.error( 'Could not fetch the latest version from the npm registry. Run with DEBUG=output-cli:npm-update for details.' );
    }

    this.log( `\nLatest Output SDK version: v${latest}\n` );

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
    const hasDeprecatedWrapper = await hasDeprecatedWrapperPackage( cwd );

    if ( hasDeprecatedWrapper ) {
      this.warn( DEPRECATED_WRAPPER_PACKAGE_WARNING );
    }

    const localPackages = await getLocalInstalledPackages( cwd );

    if ( localPackages.length > 0 ) {
      return this.handleLocalSdkPackageUpdate( cwd, latest, localPackages );
    }

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
      await updateLocal( cwd, [ '@outputai/cli' ], latest );
      const newLocalVersion = await getLocalInstalledVersion( cwd );

      if ( newLocalVersion ) {
        this.log( `\nLocal install updated to v${newLocalVersion}` );

        if ( isOutdated( newLocalVersion, latest ) ) {
          this.warn(
            `Your package.json constrains @outputai/cli to v${newLocalVersion}. ` +
            'Update your Output SDK package version ranges to get the latest CLI.'
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

  private async handleLocalSdkPackageUpdate(
    cwd: string,
    latest: string,
    localPackages: LocalInstalledPackage[]
  ): Promise<boolean> {
    const outdatedPackages = localPackages.filter( pkg => this.isLocalSdkPackageOutdated( pkg, latest ) );

    if ( outdatedPackages.length === 0 ) {
      this.log( '\nLocal Output SDK packages: up to date' );
      return false;
    }

    this.log( '\nLocal Output SDK packages:' );
    for ( const pkg of localPackages ) {
      const current = pkg.version ? `v${pkg.version}` : `declared ${pkg.declaredVersion}`;
      const suffix = this.isLocalSdkPackageOutdated( pkg, latest ) ? ` -> v${latest}` : ' (up to date)';
      this.log( `  ${pkg.name}: ${current}${suffix}` );
    }

    const shouldUpdate = await confirm( {
      message: `Update local Output SDK packages to v${latest}?`
    } );

    if ( !shouldUpdate ) {
      return false;
    }

    try {
      await updateLocalPackages( cwd, localPackages, latest );
      const newLocalPackages = await getLocalInstalledPackages( cwd );

      if ( newLocalPackages.length > 0 ) {
        this.log( `\nLocal Output SDK packages updated to v${latest}` );

        const stalePackages = newLocalPackages.filter( pkg => pkg.version && isOutdated( pkg.version, latest ) );
        if ( stalePackages.length > 0 ) {
          const staleNames = stalePackages.map( pkg => `${pkg.name}@${pkg.version}` ).join( ', ' );
          this.warn( `Some Output SDK packages are still behind v${latest}: ${staleNames}` );
        }
      } else {
        this.log( '\nLocal update completed (could not verify new versions)' );
      }

      return true;
    } catch ( error: unknown ) {
      this.warn( `Failed to update local install: ${getErrorMessage( error )}` );
      return false;
    }
  }

  private isLocalSdkPackageOutdated( pkg: LocalInstalledPackage, latest: string ): boolean {
    return pkg.version ? isOutdated( pkg.version, latest ) : true;
  }
}
