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
  constructor( credentialsPath: string, underlyingError?: string ) {
    const message = underlyingError ?
      `Failed to decrypt ${credentialsPath}: ${underlyingError}. ` +
      'The credentials key may not match the one used to encrypt this file, or the credentials file may be corrupted. ' +
      'Check OUTPUT_CREDENTIALS_KEY env var or config/credentials.key.' :
      `Failed to decrypt ${credentialsPath}. The credentials key does not match the one used to encrypt this file. ` +
      'Check OUTPUT_CREDENTIALS_KEY env var or config/credentials.key.';
    super( message );
    this.name = 'InvalidCredentialsKeyError';
  }
}

export class MalformedCredentialsKeyError extends Error {
  constructor( credentialsPath: string, detail: string ) {
    super(
      `Credentials key for ${credentialsPath} is malformed (${detail}). ` +
      'The key must be exactly 64 hex characters. ' +
      'Check OUTPUT_CREDENTIALS_KEY env var or config/credentials.key for typos, whitespace, or truncation.'
    );
    this.name = 'MalformedCredentialsKeyError';
  }
}

export class SealedRecipientMismatchError extends Error {
  constructor( credentialsPath: string, expectedRecipient: string, actualRecipient: string ) {
    super(
      `Sealed credentials ${credentialsPath} were sealed for a different key. ` +
      `The file's recipient public key is ${actualRecipient}, but the configured private key ` +
      `corresponds to ${expectedRecipient}. The file was sealed for a different keypair, or the ` +
      'wrong OUTPUT_CREDENTIALS_KEY is configured. Run "output credentials verify" to diagnose.'
    );
    this.name = 'SealedRecipientMismatchError';
  }
}

export class SealedValueError extends Error {
  constructor( credentialsPath: string, detail: string ) {
    super(
      `Failed to open a sealed value in ${credentialsPath}: ${detail}. ` +
      'The value may be corrupted or sealed for a different key.'
    );
    this.name = 'SealedValueError';
  }
}
