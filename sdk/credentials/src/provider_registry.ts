import type { CredentialsProvider } from './types.js';

const registry: { provider: CredentialsProvider | null } = { provider: null };

export const getProvider = (): CredentialsProvider => {
  if ( !registry.provider ) {
    throw new Error( 'No credentials provider configured. Call setProvider() first.' );
  }
  return registry.provider;
};

export const setProvider = ( provider: CredentialsProvider ): void => {
  registry.provider = provider;
};
