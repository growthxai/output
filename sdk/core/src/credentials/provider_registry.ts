import type { CredentialsProvider } from './types.js';
import { encryptedYamlProvider } from './encrypted_yaml_provider.js';

const registry: { provider: CredentialsProvider } = { provider: encryptedYamlProvider };

export const getProvider = (): CredentialsProvider => registry.provider;

export const setProvider = ( provider: CredentialsProvider ): void => {
  registry.provider = provider;
};
