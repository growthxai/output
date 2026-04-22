# @outputai/core

## 0.2.0

### Patch Changes

- f13723b: Updating dependencies:

  - @oclif/plugin-help
  - dotenv
  - json-schema-library
  - react
  - redis
  - undici
  - @noble/ciphers
  - @ai-sdk/amazon-bedrock
  - @ai-sdk/anthropic
  - @ai-sdk/azure
  - @ai-sdk/google-vertex
  - @ai-sdk/openai
  - @ai-sdk/perplexity
  - ai
  - liquidjs

  Adding version overrides to fix vulnerabilities:

  - vite@>=7.1.0 <=7.3.1: `>=7.3.2`
  - hono@<4.12.12: `>=4.12.12`
  - hono@>=4.0.0 <=4.12.11: `>=4.12.12`
  - @hono/node-server@<1.19.13: `>=1.19.13`
  - follow-redirects@<=1.15.11: `>=1.16.0`
  - hono@<4.12.14: `>=4.12.14`
  - axios@>=1.0.0 <1.15.0: `>=1.15.0`
  - protobufjs@<7.5.5: `>=7.5.5`

- ac8c0f7: Bumping dependency versions

## 0.1.12

### Patch Changes

- 76bcede: Add `agent()` and `skill()` abstractions to `@outputai/llm` for composing reusable LLM agents with structured output and a lazy-loaded skills system. Add `findContentDir()` to `@outputai/core` and fix skill path resolution to be relative to the prompt file rather than the calling module. Add `output-copy-assets` bin to `@outputai/core` to centralise worker asset copying.
- 3ed2168: Add support for Workflow alias names

## 0.1.11

## 0.1.10

### Patch Changes

- 41ecc1b: Updating dependencies to latest and overriding version to fix vulnerabilities

## 0.1.9

## 0.1.8

## 0.1.7

### Patch Changes

- ac7fc2b: Bumping dependecies minor, patch versions

## 0.1.6

## 0.1.5

## 0.1.4

### Patch Changes

- b9b986d: Patching vulnerable dependencies

## 0.1.3

### Patch Changes

- 2547029: Add `credential:` env var convention for automatic secret resolution at worker startup.

  `core`: add `WORKER_BEFORE_START` lifecycle event and `onBeforeStart` hook.

  `credentials`: add `resolveCredentialRefs()` that resolves `credential:<dot.path>` env vars from encrypted credentials, auto-registered via `onBeforeStart` on import.

  `cli`: scaffold build script now copies `*.key` files to `dist/` alongside `*.yml.enc`.

## 0.1.2

## 0.1.1

### Patch Changes

- ec4c478: Updating dependencies with minor and patch updates.
