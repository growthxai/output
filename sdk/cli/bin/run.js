#!/usr/bin/env node

import { execute } from '@oclif/core';
import { loadEnvironment } from '../dist/utils/env_loader.js';

// Load environment variables from .env files before executing CLI
loadEnvironment();

await execute( { dir: import.meta.url } );
