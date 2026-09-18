---
name: output-dev-cost-hooks
description: Subscribe to cost events (cost:http:request, llm:generation:metering) to forward LLM and API spend to your own observability system. Use when adding cost/spend logging, building a cost observability integration, or forwarding per-request cost data to an external system.
allowed-tools: [Read, Write, Edit, Glob]
---

# Cost Observability Hooks

## Overview

This skill documents how to subscribe to Output's cost events so every priced LLM call and every HTTP call with attached cost (via `addRequestCost`, see `output-dev-http-client-create`) can be forwarded to your own observability system — a webhook, a structured log pipeline, a metrics backend, etc. Handler errors are caught and logged by the framework; they never affect the workflow or the request that triggered them.

## When to Use This Skill

- Forwarding per-call spend to an external observability/webhook endpoint
- Logging cost events as structured fields for a log platform
- Building alerting or dashboards on top of workflow spend
- Auditing which workflows/activities are driving cost, in real time rather than after the fact

This skill is about **project-wide hook registration** for cost data already emitted by the framework. To make an HTTP client emit cost in the first place, see `output-dev-http-client-create`.

## Setup

### 1. Create a hook file

Hook files are plain JavaScript, loaded directly by the worker at startup — not compiled from a `.ts` source, and not part of your `src/` TypeScript build.

```javascript
// src/cost_hooks.js
import { on } from '@outputai/core/hooks';

on('cost:http:request', async event => {
  // handle HTTP cost
});

on('llm:generation:metering', async event => {
  // handle LLM cost
});
```

### 2. Register the file

Add the file to `outputai.hookFiles` in `package.json`, alongside any existing hook files. Paths are relative to the package root, pointing at the `.js` file itself:

```json
{
  "outputai": {
    "hookFiles": [
      "node_modules/@outputai/credentials/dist/hooks.js",
      "./src/cost_hooks.js"
    ]
  }
}
```

## Events You Can Subscribe To

| Event | Type import (for `.ts` code elsewhere in your project) | When it fires | Prefer for |
|-------|-------------|----------------|-------------|
| `llm:generation:metering` | `LLMGenerationMeteringEvent` from `@outputai/llm` | After every LLM generation (text, image, Agent, streaming) that reports usage — including failed calls that got at least partial usage | New LLM cost integrations |
| `cost:llm:request` | `LLMUsageEvent` from `@outputai/llm` | Legacy/compatible LLM cost event, same completion path | Existing handlers only — do not use for new work |
| `cost:http:request` | `HttpRequestCostEvent` from `@outputai/http` | Only when your code (or a client's `afterResponse` hook) calls `addRequestCost(response, total)` | Non-LLM paid API calls |

Every event carries the same envelope: `eventId` (UUID v4, stable idempotency key), `eventDate` (ms epoch), `activityInfo` and `workflowDetails` (present when emitted from within a step/evaluator), `outputActivityKind`, and `payload` (the event-specific data described above).

## Pattern 1: Forward to an external endpoint

Use this when spend needs to reach an external observability system over HTTP. Forward the raw envelope plus payload; redact anything that might carry secrets (API keys or tokens embedded in query strings) before logging or sending the URL.

```javascript
// src/cost_hooks.js
import { on } from '@outputai/core/hooks';
import { createKyClient } from '@outputai/http';
import { credentials } from '@outputai/credentials';

const observabilityClient = createKyClient({
  prefix: credentials.require('observability.webhook_url'),
  timeout: 5000,
  retry: { limit: 1 }
});

// Strip query strings — some APIs put API keys or tokens there.
const redactUrl = url => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[unparseable-url]';
  }
};

on('cost:http:request', async event => {
  if (!event.workflowDetails || !event.payload) {
    return;
  }

  // A caught failure here logs with this handler's own context; an
  // uncaught one is still caught and logged by the framework either way.
  try {
    await observabilityClient.post('events', {
      json: {
        eventId: event.eventId,
        eventDate: event.eventDate,
        workflowId: event.workflowDetails.workflowId,
        kind: 'http',
        url: redactUrl(event.payload.url),
        totalUsd: event.payload.total
      }
    });
  } catch (error) {
    console.warn('cost_hooks: failed to forward HTTP cost event', error);
  }
});

on('llm:generation:metering', async event => {
  if (!event.workflowDetails || !event.payload) {
    return;
  }

  try {
    await observabilityClient.post('events', {
      json: {
        eventId: event.eventId,
        eventDate: event.eventDate,
        workflowId: event.workflowDetails.workflowId,
        kind: 'llm',
        providerId: event.payload.usage.providerId,
        modelId: event.payload.usage.modelId,
        totalUsd: event.payload.cost?.total ?? null
      }
    });
  } catch (error) {
    console.warn('cost_hooks: failed to forward LLM cost event', error);
  }
});
```

## Pattern 2: Structured logging

Use this when spend just needs to land in your log platform as structured facets, without a separate network call. Use the framework `Logger` so fields are emitted consistently with the rest of the worker's logs.

```javascript
// src/cost_hooks.js
import { on } from '@outputai/core/hooks';
import { Logger } from '@outputai/core';

const log = Logger.createLogger('CostObservability');

const redactUrl = url => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[unparseable-url]';
  }
};

on('cost:http:request', async event => {
  if (!event.workflowDetails || !event.payload) {
    return;
  }

  log.info('http_request_cost', {
    eventId: event.eventId,
    workflowId: event.workflowDetails.workflowId,
    url: redactUrl(event.payload.url),
    totalUsd: event.payload.total
  });
});

on('llm:generation:metering', async event => {
  if (!event.workflowDetails || !event.payload) {
    return;
  }

  log.info('llm_generation_cost', {
    eventId: event.eventId,
    workflowId: event.workflowDetails.workflowId,
    providerId: event.payload.usage.providerId,
    modelId: event.payload.usage.modelId,
    totalUsd: event.payload.cost?.total ?? null
  });
});
```

## Handler Safety Rules

- **Handlers are wrapped in try/catch by the framework.** A thrown or rejected handler is caught and logged (e.g. `<eventName> hook error`) and never affects the workflow, the worker, or the request that triggered the event — the same guarantee `onError` handlers get. Adding your own `try/catch` is still worthwhile so a forwarding failure logs with context you control, but it's not required for safety.
- **Skip incomplete events.** Guard on `event.workflowDetails` and `event.payload` before using them — they're only populated when the event was emitted from within a step/evaluator context; `eventId` and `eventDate`, by contrast, are always present.
- **Redact before logging or sending URLs.** Some third-party APIs embed API keys or tokens in query strings. Strip the query string (and any path segments you know carry secrets) before it leaves the process.
- **Use `eventId` as an idempotency key** when forwarding to a system that might receive the same event more than once (e.g. retried delivery).
- **Expect one event per attempt.** A step or evaluator that retries emits one cost event per attempt — that's correct, since each attempt is a real billed call.
- **Prefer `llm:generation:metering` over `cost:llm:request`** for new integrations; the legacy event's shape is frozen and misses newer cost types (e.g. tool/grounding charges).

## Verification Checklist

- [ ] Hook file is plain JavaScript (not compiled from `.ts`) and imports `on` from `@outputai/core/hooks`
- [ ] Hook file registered in `outputai.hookFiles` in `package.json`, pointing directly at that `.js` file
- [ ] Handlers guard on missing `workflowDetails` / `payload`
- [ ] URLs are redacted (query string stripped) before logging or forwarding
- [ ] `llm:generation:metering` used instead of legacy `cost:llm:request` for new work

## Related Skills

- `output-dev-http-client-create` - Attaching cost to a paid API client with `addRequestCost`
- `output-dev-workflow-cost` - Post-hoc cost calculation for a single completed workflow run via the CLI
- `output-dev-credentials` - Storing the observability endpoint URL/token as a credential
