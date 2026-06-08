import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml, dump as stringifyYaml } from 'js-yaml';
import {
  encrypt, decrypt, generateKey,
  generateKeypair,
  isValidKeyHex,
  detectFormat,
  parseSealedDocument,
  serializeSealedDocument,
  sealTree,
  resealTree,
  openSealedDocument,
  SEALED_FORMAT,
  resolveCredentialsPath as resolveCredPath,
  resolveKeyPath as resolveKPath,
  resolvePublicKeyPath as resolvePubPath,
  resolveKeyEnvVar,
  resolveWorkflowCredentialsPath,
  resolveWorkflowKeyPath,
  resolveWorkflowPublicKeyPath,
  resolveWorkflowKeyEnvVar,
  type SealedDocument
} from '@outputai/credentials';

export type CredentialsEnvironment = string | undefined;
export type WorkflowTarget = string | undefined;

const WORKFLOWS_DIR = path.join( 'src', 'workflows' );

const resolveWorkflowDir = ( workflow: string ): string =>
  path.resolve( process.cwd(), WORKFLOWS_DIR, workflow );

export const resolveCredentialsPath = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string =>
  workflow ?
    resolveWorkflowCredentialsPath( resolveWorkflowDir( workflow ) ) :
    resolveCredPath( process.cwd(), environment );

export const resolveKeyPath = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string =>
  workflow ?
    resolveWorkflowKeyPath( resolveWorkflowDir( workflow ) ) :
    resolveKPath( process.cwd(), environment );

export const resolvePublicKeyPath = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string =>
  workflow ?
    resolveWorkflowPublicKeyPath( resolveWorkflowDir( workflow ) ) :
    resolvePubPath( process.cwd(), environment );

export const resolveKey = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string => {
  if ( workflow ) {
    const wfEnvVar = resolveWorkflowKeyEnvVar( workflow );

    if ( process.env[wfEnvVar] ) {
      return process.env[wfEnvVar]!;
    }

    const wfKeyPath = resolveKeyPath( undefined, workflow );

    if ( fs.existsSync( wfKeyPath ) ) {
      return fs.readFileSync( wfKeyPath, 'utf8' ).trim();
    }

    return resolveKey( undefined );
  }

  const envVar = resolveKeyEnvVar( environment );

  if ( process.env[envVar] ) {
    return process.env[envVar]!;
  }

  const keyPath = resolveKeyPath( environment );

  if ( fs.existsSync( keyPath ) ) {
    return fs.readFileSync( keyPath, 'utf8' ).trim();
  }

  throw new Error( `No key found. Set ${envVar} env var or create ${keyPath}.` );
};

/** Like resolveKey but returns null instead of throwing when no key is available. */
export const resolveKeyOptional = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string | null => {
  try {
    return resolveKey( environment, workflow );
  } catch {
    return null;
  }
};

export const credentialsExist = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): boolean =>
  fs.existsSync( resolveCredentialsPath( environment, workflow ) );

/**
 * Write a file durably: stage to a temp file in the same directory, fsync, set the
 * requested mode explicitly (so it applies even when overwriting an existing file —
 * `writeFileSync`'s `mode` option is ignored for files that already exist), then rename
 * into place. The rename is atomic, so a reader never sees a half-written file.
 */
const writeFileAtomic = ( filePath: string, data: string | Uint8Array, mode?: number ): void => {
  const dir = path.dirname( filePath );
  fs.mkdirSync( dir, { recursive: true } );

  const tmp = path.join( dir, `.${path.basename( filePath )}.${process.pid}.tmp` );
  try {
    const bytes = typeof data === 'string' ? Buffer.from( data, 'utf8' ) : Buffer.from( data );
    const fd = fs.openSync( tmp, 'w', mode ?? 0o644 );
    try {
      fs.writeSync( fd, bytes );
      fs.fsyncSync( fd );
    } finally {
      fs.closeSync( fd );
    }

    if ( mode !== undefined ) {
      fs.chmodSync( tmp, mode );
    }

    fs.renameSync( tmp, filePath );
  } catch ( error ) {
    fs.rmSync( tmp, { force: true } );
    throw error;
  }
};

const readCredentialsFile = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): { credPath: string; content: string } => {
  const credPath = resolveCredentialsPath( environment, workflow );

  if ( !fs.existsSync( credPath ) ) {
    throw new Error( `Credentials file not found: ${credPath}` );
  }

  return { credPath, content: fs.readFileSync( credPath, 'utf8' ).trim() };
};

export const isSealedCredentials = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): boolean => {
  if ( !credentialsExist( environment, workflow ) ) {
    return false;
  }

  const { content } = readCredentialsFile( environment, workflow );
  return detectFormat( content ) === SEALED_FORMAT;
};

/** Read a sealed document (recipient + still-sealed tree) without needing the private key. */
export const readSealedDocument = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): SealedDocument => {
  const { content } = readCredentialsFile( environment, workflow );
  return parseSealedDocument( content );
};

/** Write a sealed document. Needs only the recipient public key, not the private key. */
export const writeSealedDocument = (
  environment: CredentialsEnvironment,
  recipient: string,
  data: Record<string, unknown>,
  workflow?: WorkflowTarget
): void => {
  const credPath = resolveCredentialsPath( environment, workflow );
  writeFileAtomic( credPath, serializeSealedDocument( recipient, data ) );
};

/**
 * Resolve the recipient public key for sealing a write: the committed `.pub` file if
 * present, otherwise the `__recipient__` recorded in the existing sealed file.
 */
export const resolveRecipientPublicKey = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string => {
  const pubPath = resolvePublicKeyPath( environment, workflow );

  const validate = ( recipient: string, source: string ): string => {
    if ( !isValidKeyHex( recipient ) ) {
      throw new Error( `Recipient public key in ${source} is malformed (expected 64 hex characters): "${recipient}".` );
    }
    return recipient;
  };

  if ( fs.existsSync( pubPath ) ) {
    return validate( fs.readFileSync( pubPath, 'utf8' ).trim(), pubPath );
  }

  if ( isSealedCredentials( environment, workflow ) ) {
    const { recipient } = readSealedDocument( environment, workflow );

    if ( recipient ) {
      return validate( recipient, 'the credentials file __recipient__ header' );
    }
  }

  throw new Error(
    `No recipient public key found at ${pubPath} and the credentials file has no recipient. ` +
    'Run "output credentials init --sealed" or "output credentials migrate --to-sealed" first.'
  );
};

export const decryptCredentials = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): string => {
  const key = resolveKey( environment, workflow );
  const { credPath, content } = readCredentialsFile( environment, workflow );

  if ( detectFormat( content ) === SEALED_FORMAT ) {
    return stringifyYaml( openSealedDocument( content, key, credPath ) );
  }

  return decrypt( content, key );
};

export const writeEncrypted = ( environment: CredentialsEnvironment, plaintext: string, workflow?: WorkflowTarget ): void => {
  const credPath = resolveCredentialsPath( environment, workflow );

  // Re-seal in place when the existing file is sealed: needs only the public key.
  if ( isSealedCredentials( environment, workflow ) ) {
    const recipient = resolveRecipientPublicKey( environment, workflow );
    const tree = ( parseYaml( plaintext ) || {} ) as Record<string, unknown>;

    // Preserve the existing sealed token for any unchanged value, so a single edit only
    // rewrites the values that actually changed (each seal uses a fresh ephemeral key, so
    // a blind re-seal would churn every line). Only safe when the recipient is unchanged
    // AND a private key can open the previous values — otherwise (e.g. the committed .pub
    // was rotated) seal the whole tree to the current recipient so the file is never left
    // with values sealed to two different recipients.
    const key = resolveKeyOptional( environment, workflow );
    const { recipient: previousRecipient, data: previous } = readSealedDocument( environment, workflow );
    const sealed = ( key && previousRecipient === recipient ) ?
      resealTree( tree, previous, recipient, key ) :
      sealTree( tree, recipient );

    writeSealedDocument( environment, recipient, sealed, workflow );
    return;
  }

  const key = resolveKey( environment, workflow );
  writeFileAtomic( credPath, encrypt( plaintext, key ) );
};

export const initCredentials = ( environment: CredentialsEnvironment, workflow?: WorkflowTarget ): { keyPath: string; credPath: string } => {
  const credPath = resolveCredentialsPath( environment, workflow );
  const keyPath = resolveKeyPath( environment, workflow );

  fs.mkdirSync( path.dirname( keyPath ), { recursive: true } );
  fs.mkdirSync( path.dirname( credPath ), { recursive: true } );

  const key = generateKey();
  fs.writeFileSync( keyPath, key, { mode: 0o600 } );

  const template = stringifyYaml( {
    anthropic: { api_key: '' },
    openai: { api_key: '' }
  } );

  fs.writeFileSync( credPath, encrypt( template, key ), 'utf8' );

  return { keyPath, credPath };
};

export const initSealed = (
  environment: CredentialsEnvironment,
  workflow?: WorkflowTarget
): { keyPath: string; credPath: string; pubPath: string; publicKey: string } => {
  const credPath = resolveCredentialsPath( environment, workflow );
  const keyPath = resolveKeyPath( environment, workflow );
  const pubPath = resolvePublicKeyPath( environment, workflow );

  const { privateKey, publicKey } = generateKeypair();

  const template = sealTree( {
    anthropic: { api_key: '' },
    openai: { api_key: '' }
  }, publicKey );

  writeFileAtomic( keyPath, privateKey, 0o600 );
  writeFileAtomic( pubPath, publicKey );
  writeFileAtomic( credPath, serializeSealedDocument( publicKey, template ) );

  return { keyPath, credPath, pubPath, publicKey };
};

/**
 * Convert a legacy (symmetric) credentials file to sealed form. Decrypts with the
 * current symmetric key, generates a fresh X25519 keypair, seals every value to it,
 * and overwrites the key file with the new private key. The caller must distribute the
 * returned private key to the runtime and commit the public key.
 *
 * Writes are atomic (temp file + rename) and, if any write throws, the original
 * credentials and key file are restored so a failed migration is not destructive.
 */
export const migrateToSealed = (
  environment: CredentialsEnvironment,
  workflow?: WorkflowTarget
): { keyPath: string; pubPath: string; credPath: string; privateKey: string; publicKey: string } => {
  const credPath = resolveCredentialsPath( environment, workflow );

  if ( !fs.existsSync( credPath ) ) {
    throw new Error( `No credentials file found at ${credPath}. Run "output credentials init" first.` );
  }

  if ( isSealedCredentials( environment, workflow ) ) {
    throw new Error( `Credentials at ${credPath} are already sealed.` );
  }

  const keyPath = resolveKeyPath( environment, workflow );
  const pubPath = resolvePublicKeyPath( environment, workflow );

  // Snapshot the originals (raw bytes) so a mid-migration failure can be rolled back to
  // the pre-migration content of all three files. (The key file is always restored 0600,
  // tightening it if it happened to be broader.)
  const originalCred = fs.readFileSync( credPath );
  const originalKey = fs.existsSync( keyPath ) ? fs.readFileSync( keyPath ) : null;
  const originalPub = fs.existsSync( pubPath ) ? fs.readFileSync( pubPath ) : null;

  // Do all fallible work (decrypt + seal) before touching any file on disk.
  const plaintext = decryptCredentials( environment, workflow );
  const tree = ( parseYaml( plaintext ) || {} ) as Record<string, unknown>;
  const { privateKey, publicKey } = generateKeypair();
  const sealedContent = serializeSealedDocument( publicKey, sealTree( tree, publicKey ) );

  const restore = ( filePath: string, original: Buffer | null, mode?: number ): void => {
    if ( original ) {
      writeFileAtomic( filePath, original, mode );
    } else {
      fs.rmSync( filePath, { force: true } );
    }
  };

  try {
    writeFileAtomic( keyPath, privateKey, 0o600 );
    writeFileAtomic( pubPath, publicKey );
    writeFileAtomic( credPath, sealedContent );
  } catch ( error ) {
    // Best-effort: attempt every restore even if one fails, and surface the ORIGINAL
    // error rather than a rollback failure, so none of the three files is left half-migrated.
    for ( const undo of [
      (): void => restore( credPath, originalCred ),
      (): void => restore( keyPath, originalKey, 0o600 ),
      (): void => restore( pubPath, originalPub )
    ] ) {
      try {
        undo();
      } catch {
        // keep attempting the remaining restores
      }
    }
    throw error;
  }

  return { keyPath, pubPath, credPath, privateKey, publicKey };
};

export const initCredentialsAtPath = ( projectPath: string ): { keyPath: string; credPath: string } => {
  const credPath = resolveCredPath( projectPath );
  const keyPath = resolveKPath( projectPath );

  fs.mkdirSync( path.dirname( keyPath ), { recursive: true } );
  fs.mkdirSync( path.dirname( credPath ), { recursive: true } );

  const key = generateKey();
  fs.writeFileSync( keyPath, key, { mode: 0o600 } );

  const template = stringifyYaml( {
    anthropic: { api_key: '<FILL_ME_OUT>' },
    openai: { api_key: '<FILL_ME_OUT>' }
  } );

  fs.writeFileSync( credPath, encrypt( template, key ), 'utf8' );

  return { keyPath, credPath };
};

export const readKeyAtPath = ( projectPath: string ): string => {
  const keyPath = resolveKPath( projectPath );
  return fs.readFileSync( keyPath, 'utf8' ).trim();
};

export const writeEncryptedAtPath = ( projectPath: string, plaintext: string ): void => {
  const key = readKeyAtPath( projectPath );
  const credPath = resolveCredPath( projectPath );
  fs.writeFileSync( credPath, encrypt( plaintext, key ), 'utf8' );
};
