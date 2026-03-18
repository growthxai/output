import { setProvider } from './provider_registry.js';
import { encryptedYamlProvider } from './encrypted_yaml_provider.js';
import { registerStartupHook } from '@outputai/core/sdk_worker_startup';
import { resolveCredentialRefs } from './credentials.js';

// Auto-configure the default provider when the barrel is imported.
// This keeps provider_registry.ts free of node:fs imports (sandbox-safe).
setProvider( encryptedYamlProvider );

// Register credential ref resolution to run at worker startup.
registerStartupHook( resolveCredentialRefs );

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
