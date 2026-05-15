---
"@outputai/core": minor
"@outputai/http": minor
"@outputai/llm": minor
"output-api": minor
---

Workflow runs now return durable usage and cost metadata alongside the workflow output. Each completed or failed run can include raw `attributes` plus convenient `aggregations` for total cost, token usage, and HTTP request counts.

For example, API and CLI JSON results can now include:

```json
{
  "attributes": [
    { "type": "llm:usage", "modelId": "gpt-4o", "total": 0.00122, "tokensUsed": 226 },
    { "type": "http:request:cost", "url": "https://api.vendor.com/search", "total": 0.42 }
  ],
  "aggregations": {
    "cost": { "total": 0.42122 },
    "tokens": { "total": 226 },
    "httpRequests": { "total": 1 }
  }
}
```

Cost events now emit the same attribute-shaped payloads used in workflow results, making hook handlers and saved run metadata easier to reconcile. This also updates `@outputai/http` request cost tracking and `@outputai/llm` response cost data to use the new attribute format.

Learn more in the [workflow result docs](https://docs.output.ai/api), [CLI result format](https://docs.output.ai/packages/cli#workflow-result-json-format), [cost events guide](https://docs.output.ai/costs/cost-events), and [v0.4.0 to v0.5.0 migration guide](https://docs.output.ai/migrations/v0.4.0-to-v0.5.0).
