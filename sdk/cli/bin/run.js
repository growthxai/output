#!/usr/bin/env node

import { execute } from '@oclif/core';
import { loadEnvironment } from '../dist/utils/env_loader.js';
import { bootstrapProxy } from '../dist/utils/proxy.js';
import { loadCredentialRefs } from '../dist/utils/credentials_loader.js';

// Load environment variables from .env files before executing CLI
loadEnvironment();
bootstrapProxy();
loadCredentialRefs();

await execute( { dir: import.meta.url } );
