import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encrypt, generateKey } from '@outputai/core/credentials';

// The key and encrypted file are generated locally (both gitignored) so no credentials key is committed
const dir = dirname( fileURLToPath( import.meta.url ) );
const keyPath = join( dir, 'credentials.key' );
const credentialsPath = join( dir, 'credentials.yml.enc' );

const fixture = `test:
  secret: credentials_are_working
  nested:
    deep_value: 42
`;

if ( !existsSync( keyPath ) || !existsSync( credentialsPath ) ) {
  const key = generateKey();
  writeFileSync( keyPath, key, { mode: 0o600 } );
  writeFileSync( credentialsPath, encrypt( fixture, key ) );
}
