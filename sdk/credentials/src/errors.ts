export class MissingKeyError extends Error {
  constructor( environment?: string | null ) {
    const envVar = environment ?
      `OUTPUT_CREDENTIALS_KEY_${environment.toUpperCase()}` :
      'OUTPUT_CREDENTIALS_KEY';
    const keyFile = environment ?
      `config/credentials/${environment}.key` :
      'config/credentials.key';
    super( `No credentials key found. Set ${envVar} env var or create ${keyFile}.` );
    this.name = 'MissingKeyError';
  }
}

export class MissingCredentialError extends Error {
  constructor( path: string ) {
    super( `Required credential not found: "${path}".` );
    this.name = 'MissingCredentialError';
  }
}

export class InvalidCredentialsKeyError extends Error {
  constructor( credentialsPath: string ) {
    super(
      `Failed to decrypt ${credentialsPath}. The credentials key does not match the one used to encrypt this file. ` +
      'Check OUTPUT_CREDENTIALS_KEY env var or config/credentials.key.'
    );
    this.name = 'InvalidCredentialsKeyError';
  }
}
