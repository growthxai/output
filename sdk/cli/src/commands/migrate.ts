import { Command, Flags } from '@oclif/core';
import { ensureOutputAISystem } from '#services/coding_agents.js';
import { invokeMigrate } from '#services/claude_client.js';
import {
  DEPRECATED_WRAPPER_PACKAGE_WARNING,
  hasDeprecatedWrapperPackage
} from '#services/npm_update_service.js';

export default class Migrate extends Command {
  static description =
    'Upgrade a project between versions of the Output framework. ' +
    'Fetches the matching migration guide from docs.output.ai and applies it.';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --to 0.2.0',
    '<%= config.bin %> <%= command.id %> --from 0.1.12 --to 0.2.0',
    '<%= config.bin %> <%= command.id %> --to 0.2.0 --notes "skip the http changes, we don\'t use that package"'
  ];

  static flags = {
    from: Flags.string( {
      description: 'Version to migrate from. Defaults to the framework version in your package.json.',
      required: false
    } ),
    to: Flags.string( {
      description: 'Version to migrate to. Defaults to the latest published version.',
      required: false
    } ),
    notes: Flags.string( {
      char: 'n',
      description: 'Extra guidance passed through to the migration agent.',
      required: false
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( Migrate );
    const projectRoot = process.cwd();
    const hasDeprecatedWrapper = await hasDeprecatedWrapperPackage( projectRoot );

    if ( hasDeprecatedWrapper ) {
      this.warn( DEPRECATED_WRAPPER_PACKAGE_WARNING );
    }

    this.log( 'Checking .outputai directory structure...' );
    await ensureOutputAISystem( projectRoot );

    this.log( '\nInvoking the /output-migrate skill...' );
    this.log( 'This may take a moment...\n' );

    const summary = await invokeMigrate( flags.from ?? '', flags.to ?? '', flags.notes );

    this.log( '\n=========' );
    this.log( summary );
    this.log( '=========\n' );
  }
}
