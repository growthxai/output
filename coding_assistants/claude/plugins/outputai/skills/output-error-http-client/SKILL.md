---
name: output-error-http-client
description: Fix HTTP client misuse in Output SDK steps. Use when seeing untraced requests, missing error details, axios-related errors, or when HTTP calls aren't being properly logged and retried.
allowed-tools: [Bash, Read]
---

# Fix HTTP Client Misuse

## Overview

This skill helps diagnose and fix issues caused by using axios, fetch, or other HTTP clients directly instead of Output SDK's `httpClient` from `@output.ai/http`. The Output SDK client provides tracing, automatic retries, and better error handling.

## When to Use This Skill

You're seeing:
- Untraced HTTP requests (not appearing in workflow traces)
- Missing error details for failed requests
- axios-related errors or import issues
- Retries not working for HTTP failures
- Inconsistent timeout behavior

## Root Cause

Using axios, fetch, or other HTTP clients directly bypasses Output SDK's:
- **Request/response tracing**: Calls aren't logged in workflow traces
- **Automatic retries**: Failed requests aren't retried
- **Error standardization**: Error formats may be inconsistent
- **Timeout handling**: Timeouts may not integrate with step timeouts

## Symptoms

### Using axios Directly

```typescript
// WRONG: Using axios
import axios from 'axios';

export const fetchData = step({
  name: 'fetchData',
  fn: async (input) => {
    const response = await axios.get('https://api.example.com/data');
    return response.data;
  },
});
```

### Using fetch Directly

```typescript
// WRONG: Using fetch
export const fetchData = step({
  name: 'fetchData',
  fn: async (input) => {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  },
});
```

## Solution

Use `httpClient` from `@output.ai/http`:

### Basic Usage

```typescript
import { z, step } from '@output.ai/core';
import { httpClient } from '@output.ai/http';

export const fetchData = step({
  name: 'fetchData',
  inputSchema: z.object({
    endpoint: z.string(),
  }),
  outputSchema: z.object({
    data: z.unknown(),
  }),
  fn: async (input) => {
    const client = httpClient({
      prefixUrl: 'https://api.example.com',
    });

    const data = await client.get(input.endpoint).json();
    return { data };
  },
});
```

### With Full Configuration

```typescript
import { httpClient } from '@output.ai/http';

const client = httpClient({
  prefixUrl: 'https://api.example.com',
  timeout: 30000,  // 30 second timeout
  retry: {
    limit: 3,      // Retry up to 3 times
    methods: ['GET', 'POST'],  // Which methods to retry
    statusCodes: [408, 500, 502, 503, 504],  // Which status codes trigger retry
  },
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});
```

## HTTP Methods

### GET Request

```typescript
const data = await client.get('users/123').json();
```

### POST Request

```typescript
const result = await client.post('users', {
  json: {
    name: 'John',
    email: 'john@example.com',
  },
}).json();
```

### PUT Request

```typescript
const updated = await client.put('users/123', {
  json: {
    name: 'John Updated',
  },
}).json();
```

### DELETE Request

```typescript
await client.delete('users/123');
```

### With Query Parameters

```typescript
const data = await client.get('search', {
  searchParams: {
    q: 'query',
    limit: 10,
  },
}).json();
```

## Complete Migration Example

### Before (Wrong - using axios)

```typescript
import axios from 'axios';
import { step } from '@output.ai/core';

export const createUser = step({
  name: 'createUser',
  fn: async (input) => {
    try {
      const response = await axios.post(
        'https://api.example.com/users',
        { name: input.name, email: input.email },
        {
          headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
          timeout: 30000,
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API Error: ${error.response?.data?.message}`);
      }
      throw error;
    }
  },
});
```

### After (Correct - using httpClient)

```typescript
import { z, step } from '@output.ai/core';
import { httpClient } from '@output.ai/http';

export const createUser = step({
  name: 'createUser',
  inputSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  fn: async (input) => {
    const client = httpClient({
      prefixUrl: 'https://api.example.com',
      timeout: 30000,
      retry: { limit: 3 },
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY}`,
      },
    });

    const user = await client.post('users', {
      json: {
        name: input.name,
        email: input.email,
      },
    }).json();

    return user;
  },
});
```

## Error Handling

The httpClient provides structured error handling:

```typescript
import { httpClient, HTTPError } from '@output.ai/http';

export const fetchData = step({
  name: 'fetchData',
  fn: async (input) => {
    const client = httpClient({ prefixUrl: 'https://api.example.com' });

    try {
      return await client.get('data').json();
    } catch (error) {
      if (error instanceof HTTPError) {
        // Access response details
        const status = error.response.status;
        const body = await error.response.json();
        throw new Error(`API returned ${status}: ${body.message}`);
      }
      throw error;
    }
  },
});
```

## Finding axios/fetch Usage

Search your codebase:

```bash
# Find axios imports
grep -rn "from 'axios'\|from \"axios\"" src/

# Find fetch calls
grep -rn "await fetch(" src/

# Find other HTTP libraries
grep -rn "got\|node-fetch\|request\|superagent" src/
```

## Benefits of httpClient

1. **Tracing**: Requests appear in workflow traces with timing
2. **Automatic Retries**: Configurable retry logic for transient failures
3. **Consistent Errors**: Standardized error format across all requests
4. **Timeout Integration**: Works with step and workflow timeouts
5. **Type Safety**: Full TypeScript support

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `prefixUrl` | Base URL for all requests | (required) |
| `timeout` | Request timeout in ms | 10000 |
| `retry.limit` | Max retry attempts | 2 |
| `retry.methods` | HTTP methods to retry | ['GET', 'PUT', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE'] |
| `retry.statusCodes` | Status codes to retry | [408, 413, 429, 500, 502, 503, 504] |
| `headers` | Default headers | {} |

## Verification

After migrating to httpClient:

1. **Run the workflow**: `npx output workflow run <name> '<input>'`
2. **Check the trace**: `npx output workflow debug <id> --format json`
3. **Verify tracing**: HTTP requests should appear in the step trace
4. **Test retries**: Simulate failures to verify retry behavior

## Related Issues

- For I/O in workflow functions, see `output-error-direct-io`
- For connection issues, see `output-services-check`
- For encrypted secrets management, see `output-dev-credentials`
