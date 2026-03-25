import './hooks.js';

export { credentials, resolveCredentialRefs } from './credentials.js';
export { setProvider, getProvider } from './provider_registry.js';
export { encryptedYamlProvider } from './encrypted_yaml_provider.js';
export { encrypt, decrypt, generateKey } from './encryption.js';
export { MissingCredentialError, MissingKeyError } from './errors.js';
export {
  getNestedValue,
  resolveCredentialsPath,
  resolveKeyPath,
  resolveKeyEnvVar,
  resolveWorkflowCredentialsPath,
  resolveWorkflowKeyPath,
  resolveWorkflowKeyEnvVar
} from './paths.js';
export type { CredentialsProvider, GlobalContext, WorkflowContext } from './types.js';
