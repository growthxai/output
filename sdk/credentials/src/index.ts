import './hooks.js';

export { credentials, resolveCredentialRefs } from './credentials.js';
export { setProvider, getProvider } from './provider_registry.js';
export { encryptedYamlProvider } from './encrypted_yaml_provider.js';
export { encrypt, decrypt, generateKey } from './encryption.js';
export {
  generateKeypair,
  publicKeyFromPrivate,
  isValidKeyHex,
  seal,
  open,
  sealTree,
  openTree,
  resealTree,
  openSealedDocument,
  isSealedValue,
  detectFormat,
  parseSealedDocument,
  serializeSealedDocument,
  SEALED_FORMAT,
  SEALED_PREFIX,
  FORMAT_FIELD,
  RECIPIENT_FIELD
} from './sealedbox.js';
export type { Keypair, SealedDocument } from './sealedbox.js';
export {
  InvalidCredentialsKeyError,
  MalformedCredentialsKeyError,
  MissingCredentialError,
  MissingKeyError,
  SealedRecipientMismatchError,
  SealedValueError
} from './errors.js';
export {
  getNestedValue,
  resolveCredentialsPath,
  resolveKeyPath,
  resolveKeyEnvVar,
  resolvePublicKeyPath,
  resolveWorkflowCredentialsPath,
  resolveWorkflowKeyPath,
  resolveWorkflowKeyEnvVar,
  resolveWorkflowPublicKeyPath
} from './paths.js';
export type { CredentialsProvider, GlobalContext, WorkflowContext } from './types.js';
