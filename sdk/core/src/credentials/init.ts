import { createChildLogger } from '#logger';
import { resolveCredentialRefs } from './credentials.js';

const log = createChildLogger( 'Credentials' );

export const init = () => {
  const vars = resolveCredentialRefs();
  log.info( 'Resolved credential env vars', { vars } );
};
