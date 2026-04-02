import { Command } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import { applyReconfiguration, planReconfiguration, type ReconfigurationPlan } from '#services/reconfigure_package.js';
import { getErrorMessage } from '#utils/error_utils.js';

const Ansi: Record<string, string> = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  RESET: '\x1b[0m'
};

export default class Reconfigure extends Command {
  static override aliases = [ 'fix' ];

  static description =
    'Reconfigure Output scripts in the package.json (reset overwrites, add missing and remove deprecated)';

  static examples = [
    '<%= config.bin %> <%= command.id %>'
  ];

  /**
   * Prints a human-readable diff-style summary
   */
  private printPlan( plan: ReconfigurationPlan ): void {
    this.log( '\nNecessary changes to package.json:' );

    if ( plan.scriptsToAdd.length > 0 ) {
      this.log( '\n  Scripts to add:' );
      plan.scriptsToAdd.forEach( ( { key } ) => this.log( `    ${Ansi.GREEN}+${Ansi.RESET} "${key}"` ) );
    }
    if ( plan.scriptsToReplace.length > 0 ) {
      this.log( '\n  Scripts to replace:' );
      plan.scriptsToReplace.forEach( ( { key } ) => this.log( `    ${Ansi.YELLOW}~${Ansi.RESET} "${key}"` ) );
    }
    if ( plan.scriptsToRemove.length > 0 ) {
      this.log( '\n  Scripts to remove:' );
      plan.scriptsToRemove.forEach( ( { key } ) => this.log( `    ${Ansi.RED}-${Ansi.RESET} "${key}"` ) );
    }

    this.log( '' );
  }

  async run(): Promise<void> {
    await this.parse( Reconfigure );

    try {
      const plan = planReconfiguration( process.cwd() );
      if ( !plan.hasChanges ) {
        this.log( 'Nothing to change, package.json is already properly configured.' );
        return;
      }

      this.printPlan( plan );

      const shouldApply = await confirm( { message: 'Apply these changes to package.json?', default: true } );
      if ( !shouldApply ) {
        return;
      }

      applyReconfiguration( plan );
      this.log( 'Done, package.json is properly configured.' );
    } catch ( error: unknown ) {
      // ExitPromptError means Ctrl+C
      if ( !( error instanceof Error ) || error.constructor.name !== 'ExitPromptError' ) {
        this.error( getErrorMessage( error ) );
      }
    }
  }
}
