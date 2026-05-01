import { setProvider } from './provider_registry.js';
import { encryptedYamlProvider } from './encrypted_yaml_provider.js';
import { onBeforeWorkerStart } from '@outputai/core/hooks';
import { resolveCredentialRefs } from './credentials.js';

setProvider( encryptedYamlProvider );
onBeforeWorkerStart( resolveCredentialRefs );
