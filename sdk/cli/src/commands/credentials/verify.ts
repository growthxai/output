import fs from 'node:fs';
import { Command, Flags } from '@oclif/core';
import {
  decrypt,
  detectFormat,
  parseSealedDocument,
  openSealedDocument,
  SEALED_FORMAT
} from '@outputai/credentials';
import { getErrorMessage } from '#utils/error_utils.js';
import {
  credentialsExist,
  resolveCredentialsPath,
  resolvePublicKeyPath,
  resolveKeyOptional
} from '#services/credentials_service.js';

export default class CredentialsVerify extends Command {
  static override description =
    'Verify a credentials file. For sealed credentials this confirms the file was sealed for the ' +
    'committed public key — a check that needs NO secret, so it is safe to run in CI.';

  static override examples = [
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
    const { flags } = await this.parse( CredentialsVerify );
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

    const credPath = resolveCredentialsPath( environment, workflow );
    const content = fs.readFileSync( credPath, 'utf8' ).trim();

    if ( detectFormat( content ) === SEALED_FORMAT ) {
      this.verifySealed( environment, workflow, credPath, content );
      return;
    }

    this.verifyLegacy( environment, workflow, credPath );
  }

  private verifySealed(
    environment: string | undefined,
    workflow: string | undefined,
    credPath: string,
    content: string
  ): void {
    const { recipient } = parseSealedDocument( content );

    if ( !recipient ) {
      this.error( `Sealed credentials at ${credPath} have no __recipient__ public key.` );
    }

    this.log( 'Format:    sealed-v1' );
    this.log( `Recipient: ${recipient}` );

    // Key-free check: the file's recipient must match the committed public key.
    const pubPath = resolvePublicKeyPath( environment, workflow );
    if ( fs.existsSync( pubPath ) ) {
      const committedPub = fs.readFileSync( pubPath, 'utf8' ).trim();

      if ( committedPub !== recipient ) {
        this.error(
          `Recipient mismatch: the credentials file was sealed for ${recipient}, but the committed ` +
          `public key (${pubPath}) is ${committedPub}. The file was sealed with the wrong key.`
        );
      }

      this.log( `✓ Recipient matches committed public key (${pubPath}).` );
    } else {
      this.warn( `No committed public key at ${pubPath} to check the recipient against.` );
    }

    // Optional deeper check when a private key is available (e.g. locally or in prod).
    // openSealedDocument runs the same key/recipient/value checks the runtime uses, so
    // WITH a key, verify and the runtime agree on whether the file opens. The key-free
    // path above only checks the recipient identity — it cannot detect a corrupt value.
    const key = resolveKeyOptional( environment, workflow );
    if ( key ) {
      try {
        openSealedDocument( content, key, credPath );
      } catch ( error ) {
        this.error( getErrorMessage( error ) );
      }

      this.log( '✓ Private key opens every sealed value.' );
    } else {
      this.log( '(no private key available — recipient check only)' );
    }

    this.log( 'Verification passed.' );
  }

  private verifyLegacy( environment: string | undefined, workflow: string | undefined, credPath: string ): void {
    this.log( 'Format: legacy (symmetric)' );

    const key = resolveKeyOptional( environment, workflow );
    if ( !key ) {
      this.warn(
        'Legacy credentials cannot be verified without the symmetric key — there is no public ' +
        'identity to check. Consider "output credentials migrate --to-sealed" for key-free verification.'
      );
      return;
    }

    // The decrypt path throws InvalidCredentialsKeyError on a wrong key.
    try {
      decrypt( fs.readFileSync( credPath, 'utf8' ).trim(), key );
    } catch ( error ) {
      this.error( `Failed to decrypt ${credPath}: ${getErrorMessage( error )}` );
    }

    this.log( '✓ The configured key decrypts the file.' );
    this.log( 'Verification passed.' );
  }
}
