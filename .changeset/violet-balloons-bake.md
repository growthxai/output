---
"output-api": patch
---

The `continued` workflow status was renamed to `continued_as_new` in API responses.

## Explicit Status Fields

| Endpoint | HTTP response JSON path | Generated client path |
| --- | --- | --- |
| `POST /workflow/run` | `status` | `response.data.status` |
| `GET /workflow/{id}/result` | `status` | `response.data.status` |
| `GET /workflow/{id}/runs/{rid}/result` | `status` | `response.data.status` |
| `GET /workflow/{id}/status` | `status` | `response.data.status` |
| `GET /workflow/{id}/runs/{rid}/status` | `status` | `response.data.status` |
| `GET /workflow/runs` | `runs[].status` | `response.data.runs[].status` |

## History Metadata Status Fields

These endpoints also return workflow status in the history metadata object. The OpenAPI schema currently leaves this nested object unexpanded.

| Endpoint | HTTP response JSON path | Generated client path |
| --- | --- | --- |
| `GET /workflow/{id}/history` | `workflow.status` | `response.data.workflow.status` |
| `GET /workflow/{id}/runs/{rid}/history` | `workflow.status` | `response.data.workflow.status` |

## Backwards support

In the CLI, the old value is still supported.
