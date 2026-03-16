import { Command, Flags } from '@oclif/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { load as parseYaml } from 'js-yaml';
import {
  decryptCredentials,
  writeEncrypted,
  credentialsExist,
  resolveCredentialsPath
} from '#services/credentials_service.js';

export default class CredentialsEdit extends Command {
  static override description = 'Edit encrypted credentials in your $EDITOR';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --environment production',
    '<%= config.bin %> <%= command.id %> --workflow my_workflow'
  ];

  static override flags = {
    environment: Flags.string( {
      char: 'e',
      description: 'Target environment (e.g. production, development)'
    } ),
    workflow: Flags.string( {
      char: 'w',
      description: 'Target a specific workflow directory'
    } )
  };

  async run(): Promise<void> {
    const { flags } = await this.parse( CredentialsEdit );
    const environment = flags.environment;
    const workflow = flags.workflow;

    if ( environment && workflow ) {
      this.error( 'Cannot specify both --environment and --workflow.' );
    }

    if ( !credentialsExist( environment, workflow ) ) {
      this.error(
        `No credentials file found at ${resolveCredentialsPath( environment, workflow )}. Run "output credentials init" first.`
      );
    }

    const editorEnv = process.env.EDITOR || process.env.VISUAL || 'vi';
    const [ editorCmd, ...editorArgs ] = editorEnv.split( /\s+/ );
    const plaintext = decryptCredentials( environment, workflow );
    const tmpFile = path.join( os.tmpdir(), `output-credentials-${Date.now()}.yml` );

    try {
      fs.writeFileSync( tmpFile, plaintext, { mode: 0o600 } );

      const result = spawnSync( editorCmd, [ ...editorArgs, tmpFile ], { stdio: 'inherit' } );

      if ( result.error ) {
        this.error( `Failed to launch editor: ${result.error.message}` );
      }

      if ( result.status !== 0 ) {
        this.error( `Editor exited with non-zero status: ${result.status}` );
      }

      const edited = fs.readFileSync( tmpFile, 'utf8' );

      // Validate YAML before saving
      parseYaml( edited );

      writeEncrypted( environment, edited, workflow );
      this.log( 'Credentials saved successfully.' );
    } finally {
      try {
        if ( fs.existsSync( tmpFile ) ) {
          const size = fs.statSync( tmpFile ).size;
          fs.writeFileSync( tmpFile, '\0'.repeat( size ) );
          fs.unlinkSync( tmpFile );
        }
      } catch {
        // best-effort cleanup
      }
    }
  }
}
