import { setProvider } from './provider_registry.js';
import { encryptedYamlProvider } from './encrypted_yaml_provider.js';
import { onBeforeStart } from '@outputai/core/hooks';
import { resolveCredentialRefs } from './credentials.js';

// Auto-configure the default provider when the barrel is imported.
// This keeps provider_registry.ts free of node:fs imports (sandbox-safe).
setProvider( encryptedYamlProvider );

// Resolve credential: env var references at worker startup.
onBeforeStart( resolveCredentialRefs );

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
