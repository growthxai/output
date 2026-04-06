---
name: output-dev-http-client-create
description: Create shared HTTP clients in src/shared/clients/ for Output SDK workflows. Use when integrating external APIs, creating service wrappers, or standardizing HTTP operations.
allowed-tools: [Read, Write, Edit, Glob]
---

# Creating HTTP Clients

## Overview

This skill documents how to create shared HTTP clients for Output SDK workflows. Clients are stored in `src/shared/clients/` and shared across all workflows to ensure consistent error handling, retry logic, and API integration patterns.

## When to Use This Skill

- Integrating a new external API service
- Creating a reusable HTTP wrapper for a service
- Standardizing error handling for API calls
- Moving inline HTTP logic to a shared client

## Location Convention

HTTP clients are stored in the shared clients folder:

```
src/shared/clients/
├── gemini_client.ts     # Google Gemini API client
├── jina_client.ts       # Jina AI client
├── perplexity_client.ts # Perplexity API client
└── {service}_client.ts  # Your new client
```

**Important**: Clients are shared across ALL workflows. Do NOT create per-workflow HTTP clients.

## Other Shared Code Locations

```
src/shared/
├── clients/     # API clients (this skill)
├── utils/       # Utility functions & helpers
├── services/    # Business logic services
├── steps/       # Shared step definitions (optional)
└── evaluators/  # Shared evaluators (optional)
```

## Import Pattern in Workflows

Use relative imports from workflow files to shared clients:

```typescript
// CORRECT - Relative path from workflow steps.ts
import { GeminiImageService } from '../../shared/clients/gemini_client.js';
import { parseResumeWithJina } from '../../shared/clients/jina_client.js';

// From shared steps (if used)
import { JinaClient } from '../clients/jina_client.js';
```

## Critical Import Rules

### HTTP Client Import

```typescript
// CORRECT - Use @outputai/http wrapper
import { httpClient } from '@outputai/http';

// WRONG - Never use axios directly
import axios from 'axios';
```

### Error Types Import

```typescript
// CORRECT - Import error types from @outputai/core
import { FatalError, ValidationError } from '@outputai/core';

// WRONG - Custom error classes
class MyCustomError extends Error { ... }
```

### Credentials Import

```typescript
// CORRECT - Use @outputai/credentials for secrets
import { credentials } from '@outputai/credentials';
const apiKey = credentials.require('service.api_key');

// WRONG - Never use process.env for secrets
const apiKey = process.env.SERVICE_API_KEY;
```

## Basic Client Structure

### Simple Function-Based Client

```typescript
import { FatalError, ValidationError } from '@outputai/core';
import { httpClient } from '@outputai/http';
import { credentials } from '@outputai/credentials';

const API_KEY = credentials.require('service.api_key');
const BASE_URL = 'https://api.service.com';

const serviceClient = httpClient({
  prefix: BASE_URL,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    Accept: 'application/json'
  },
  timeout: 30000,
  retry: {
    limit: 3,
    statusCodes: [408, 429, 500, 502, 503, 504]
  }
});

/**
 * Fetch data from the service
 *
 * @param query - Search query string
 * @returns Processed response data
 * @throws {FatalError} If authentication fails or resource not found
 * @throws {ValidationError} If temporary error occurs
 */
export async function fetchServiceData(query: string): Promise<ServiceResponse> {
  const response = await serviceClient.get('endpoint', {
    searchParams: { q: query }
  });

  const data = await response.json();

  if (!data.results) {
    throw new FatalError('No results returned from service');
  }

  return data;
}
```

### Class-Based Client

```typescript
import { FatalError, ValidationError } from '@outputai/core';
import { httpClient } from '@outputai/http';

export interface ServiceOptions {
  model?: string;
  timeout?: number;
}

export class ServiceClient {
  private readonly client: ReturnType<typeof httpClient>;
  private readonly model: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? credentials.require('service.api_key');

    this.client = httpClient({
      prefix: 'https://api.service.com',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      retry: {
        limit: 3,
        statusCodes: [408, 429, 500, 502, 503, 504]
      }
    });

    this.model = 'default-model';
  }

  async process(input: ProcessInput): Promise<ProcessOutput> {
    try {
      const response = await this.client.post('process', {
        json: {
          model: this.model,
          input
        }
      });

      return await response.json();
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };

      if (err.status === 429) {
        throw new ValidationError(`Rate limit exceeded: ${err.message}`);
      }

      if (err.status === 401 || err.status === 403) {
        throw new FatalError(`Authentication failed: ${err.message}`);
      }

      throw new ValidationError(`Service call failed: ${err.message}`);
    }
  }
}
```

## Real-World Examples

### Example 1: Jina Client (Function-Based)

```typescript
import { FatalError } from '@outputai/core';
import { httpClient } from '@outputai/http';

const JINA_API_KEY = process.env.JINA_API_KEY || '';
const JINA_BASE_URL = 'https://r.jina.ai';

const jinaClient = httpClient({
  prefix: JINA_BASE_URL,
  headers: {
    Authorization: `Bearer ${JINA_API_KEY}`,
    Accept: 'application/json'
  },
  timeout: 30000,
  retry: {
    limit: 3,
    statusCodes: [408, 413, 429, 500, 502, 503, 504]
  }
});

/**
 * Parse PDF resume using Jina Reader API
 */
export async function parseResumeWithJina(base64Pdf: string): Promise<string> {
  const response = await jinaClient.post('', {
    json: { pdf: base64Pdf },
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const data: {
    data: {
      content: string;
      title?: string;
    };
  } = await response.json();

  if (!data.data?.content) {
    throw new FatalError('No content returned from Jina PDF parser');
  }

  return data.data.content;
}

/**
 * Scrape text content from URL using Jina Reader
 */
export async function scrapeTextWithJina(url: string): Promise<string> {
  const response = await jinaClient.get(url, {
    headers: {
      'X-Return-Format': 'text',
      'X-No-Cache': 'true',
      'X-Timeout': '30'
    }
  });

  const data: {
    data: {
      text?: string;
      content?: string;
    };
  } = await response.json();

  const textContent = data.data?.text || data.data?.content;

  if (!textContent) {
    throw new FatalError(`No text content returned from URL: ${url}`);
  }

  return textContent;
}
```

### Example 2: Gemini Client (Class-Based)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FatalError, ValidationError } from '@outputai/core';

export interface GeminiImageGenerationOptions {
  prompt: string;
  referenceImages?: Array<{
    inlineData: {
      mimeType: string;
      data: string;
    };
  }>;
  aspectRatio?: string;
  resolution?: string;
  numberOfImages?: number;
}

export class GeminiImageService {
  private readonly client: GoogleGenerativeAI;
  private readonly model: string = 'gemini-3-pro-image-preview';

  constructor(apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY) {
    if (!apiKey) {
      throw new FatalError(
        'GeminiImageService: No API Key provided (GOOGLE_GEMINI_API_KEY or GOOGLE_CLOUD_API_KEY).'
      );
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateImage(options: GeminiImageGenerationOptions): Promise<string[]> {
    const { prompt, referenceImages = [], aspectRatio = '1:1', resolution = '1K', numberOfImages = 1 } = options;

    try {
      const model = this.client.getGenerativeModel({ model: this.model });

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (referenceImages.length > 0) {
        referenceImages.forEach(img => parts.push(img));
      }

      const finalPrompt = `${prompt}\n\nGenerate this as a ${aspectRatio} aspect ratio image at ${resolution} resolution.`;
      parts.push({ text: finalPrompt });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 1.0,
          topP: 0.95,
          candidateCount: numberOfImages,
          maxOutputTokens: 8192
        }
      });

      const images: string[] = [];
      const candidates = result.response.candidates || [];

      for (const candidate of candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
              images.push(part.inlineData.data);
            }
          }
        }
      }

      if (images.length === 0) {
        throw new ValidationError('No images were generated by Gemini');
      }

      return images;
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };

      if (err.status === 429) {
        throw new ValidationError(`Gemini rate limit exceeded: ${err.message}`);
      }

      if (err.status === 401 || err.status === 403) {
        throw new FatalError(`Gemini authentication failed: ${err.message}`);
      }

      throw new ValidationError(`Gemini image generation failed: ${err.message}`);
    }
  }
}
```

## Error Handling Patterns

### HTTP Status Code Handling

```typescript
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const FATAL_STATUS_CODES = [401, 403, 404];

const client = httpClient({
  retry: {
    limit: 3,
    statusCodes: RETRY_STATUS_CODES
  },
  hooks: {
    beforeError: [
      error => {
        const status = error.response?.status;
        const message = error.message;

        if (status && FATAL_STATUS_CODES.includes(status)) {
          throw new FatalError(`HTTP ${status} error: ${message}`);
        }

        throw new ValidationError(`HTTP request failed: ${message}`);
      }
    ]
  }
});
```

### Error Type Guidelines

| Status Code | Error Type | Reason |
|-------------|------------|--------|
| 401, 403 | FatalError | Auth failures won't succeed on retry |
| 404 | FatalError | Resource doesn't exist |
| 408 | ValidationError | Timeout, may succeed on retry |
| 429 | ValidationError | Rate limit, will succeed after wait |
| 500+ | ValidationError | Server errors may be temporary |

## Best Practices

### 1. Use Credentials for API Keys

Prefer `@outputai/credentials` over `process.env` for secrets management. See `output-dev-credentials` skill for details.

```typescript
import { credentials } from '@outputai/credentials';

// credentials.require() throws MissingCredentialError if not found
const apiKey = credentials.require('service.api_key');

// credentials.get() returns undefined or default if not found
const region = credentials.get('aws.region', 'us-east-1');
```

### 2. Document Functions with JSDoc

```typescript
/**
 * Fetch user profile from external service
 *
 * @param userId - Unique user identifier
 * @returns User profile data
 * @throws {FatalError} If user not found or auth fails
 * @throws {ValidationError} If temporary error occurs
 *
 * @example
 * const profile = await fetchUserProfile('user-123');
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  // ...
}
```

### 3. Use Consistent Timeouts

```typescript
// Standard timeout: 30 seconds
timeout: 30000

// Long-running operations: 60 seconds
timeout: 60000
```

### 4. Export TypeScript Interfaces

```typescript
// Export interfaces for consumers
export interface ServiceResponse {
  data: {
    id: string;
    content: string;
  };
  metadata: {
    processedAt: string;
  };
}
```

## Verification Checklist

- [ ] Client file located in `src/shared/clients/` directory
- [ ] File named `{service}_client.ts`
- [ ] `httpClient` imported from `@outputai/http` (not axios)
- [ ] `FatalError` and `ValidationError` imported from `@outputai/core`
- [ ] API key validation in constructor/initialization
- [ ] Retry configuration for appropriate status codes
- [ ] FatalError used for 401, 403, 404 responses
- [ ] ValidationError used for 429, 5xx responses
- [ ] JSDoc documentation for exported functions
- [ ] TypeScript interfaces exported for response types

## Related Skills

- `output-dev-step-function` - Using clients in step functions
- `output-dev-evaluator-function` - Using clients in evaluators
- `output-dev-folder-structure` - Understanding project layout
- `output-dev-credentials` - Encrypted secrets management
- `output-error-http-client` - Troubleshooting HTTP issues
- `output-error-try-catch` - Proper error handling patterns
