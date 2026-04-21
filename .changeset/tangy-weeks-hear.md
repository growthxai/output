---
"@outputai/credentials": patch
"@outputai/core": patch
"@outputai/cli": patch
"@outputai/llm": patch
"output-api": patch
"@outputai/evals": patch
"@outputai/output": patch
"@outputai/http": patch
---

Updating dependencies:
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
