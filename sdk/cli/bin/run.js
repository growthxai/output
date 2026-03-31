#!/usr/bin/env node

import { execute } from '@oclif/core';
import { loadEnvironment } from '../dist/utils/env_loader.js';
import { resolveCredentialRefs } from '@outputai/credentials';

// Load environment variables from .env files before executing CLI
loadEnvironment();
resolveCredentialRefs();

await execute( { dir: import.meta.url } );
