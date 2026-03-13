export class MissingKeyError extends Error {
  constructor( environment?: string | null ) {
    const envVar = environment ?
      `OUTPUT_CREDENTIALS_KEY_${environment.toUpperCase()}` :
      'OUTPUT_CREDENTIALS_KEY';
    const keyFile = environment ?
      `config/credentials/${environment}.key` :
      'config/credentials.key';
    super( `No credentials key found. Set ${envVar} env var or create ${keyFile}.` );
  }
}

export class MissingCredentialError extends Error {
  constructor( path: string ) {
    super( `Required credential not found: "${path}".` );
  }
}
