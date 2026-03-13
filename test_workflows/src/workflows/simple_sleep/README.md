# Simple Sleep Workflow

Demonstrates **delay-based throttling** using the `sleep` primitive exported from `@outputai/core`.

## Use Case

When calling rate-limited external APIs, you often need to add delays between requests to avoid quota violations. This workflow shows the pattern:

```typescript
import { sleep } from "@outputai/core";

for (const url of urls) {
  await sleep(delayMs);
  await processUrl(url);
}
```

## Running the Workflow

Using scenario shorthand (recommended):

```bash
output workflow run simple_sleep basic_urls
```

Using explicit file path:

```bash
output workflow run simple_sleep --input test_workflows/src/workflows/simple_sleep/scenarios/basic_urls.json
```

Using inline JSON:

```bash
output workflow run simple_sleep --input '{"urls": ["https://example.com", "https://httpbin.org/get"], "delayMs": 100}'
```

## Input

| Field     | Type       | Default  | Description                           |
| --------- | ---------- | -------- | ------------------------------------- |
| `urls`    | `string[]` | required | Array of URLs to process              |
| `delayMs` | `number`   | `100`    | Milliseconds to wait between each URL |

## Output

| Field       | Type     | Description             |
| ----------- | -------- | ----------------------- |
| `processed` | `number` | Count of URLs processed |

## Scenarios

- `basic_urls.json` - 3 URLs with 100ms delay
- `single_url.json` - 1 URL with 50ms delay
- `slow_throttle.json` - 2 URLs with 500ms delay
