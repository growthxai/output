# Output API

Express API server for executing and managing Output workflows.

## Quick Start

The API is intended to be run from the project root using the `run.sh` script:

```bash
./run.sh dev
```

This starts the entire Output environment including the API server, Temporal, and workers.

To start the entire Output environment including the API server and Temporal, but without a worker, use:

```bash
./run.sh prod
```

For both scenarios, the server runs on port 3001 by default (or `PORT` env variable).

## API Endpoints

- `GET /health` - Health check
- `POST /workflow/run` - Execute workflow synchronously
- `POST /workflow/start` - Start workflow asynchronously
- `GET /workflow/:id/status` - Get workflow status
- `GET /workflow/:id/result` - Get workflow result
- `GET /workflow/:id/trace-log` - Get workflow execution trace
- `PATCH /workflow/:id/stop` - Stop workflow execution
- `GET /workflow/catalog` - Get default workflow catalog
- `GET /workflow/catalog/:id` - Get specific catalog by ID
- `POST /workflow/:id/feedback` - Send feedback to workflow
- `POST /heartbeat` - Test endpoint

## Authentication

Production mode requires Basic Auth via `API_AUTH_TOKEN` environment variable. Note: The `/health` endpoint is always accessible without authentication.

## Logging

The API uses Winston for structured logging with environment-specific formatting.

### Log Levels

- **Production**: `http` level and above (http, info, warn, error)
- **Development**: `debug` level and above (all logs including debug, http, info, warn, error)

### Log Formats

**Development** (human-readable):

```
[INFO] API server started {"port":3001,"environment":"development"}
[HTTP] POST /workflow/run 200 512 - 45.123 ms
```

**Production** (structured JSON for Datadog):

```json
{"level":"info","message":"API server started","port":3001,"service":"output-api","environment":"production","timestamp":"2025-12-08T10:30:00.000Z"}
{"level":"http","message":"HTTP request","method":"POST","url":"/workflow/run","status":200,"response_time":45.123,"request_id":"550e8400-e29b-41d4-a716-446655440000","service":"output-api","timestamp":"2025-12-08T10:30:05.000Z"}
```

### Request ID Tracking

Every request is assigned a unique ID for tracing across logs:

- **Priority**: `Rndr-Id` header (Render.com) → `X-Request-ID` header → generated UUID
- **Response header**: `X-Request-ID` is included in all responses
- **Logs**: Request ID appears in all log entries for that request

Example:

```bash
curl -H "X-Request-ID: my-trace-id" http://localhost:3001/workflow/run
```

### HTTP Request Logging

All HTTP requests are logged automatically (except `/health` and `/heartbeat`):

- Method, URL, status code
- Response time in milliseconds
- Request ID and Render request ID (if present)
- Content length

### Error Logging

Errors are logged with structured context:

- **Expected errors** (404, 424): `warn` level
- **Unexpected errors** (500): `error` level
- **Context**: Error type, message, request ID, method, sanitized URL
- **Stack traces**: Only in development mode

### Environment Variables

- `NODE_ENV=production` - Enables JSON logging and http+ level
- `NODE_ENV=development` - Enables colorized logging and debug+ level

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `API_AUTH_TOKEN` | Authentication token for production mode |
| `TEMPORAL_ADDRESS` | Temporal server address |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 trace fetching |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 trace fetching |
| `AWS_REGION` | AWS region for S3 (default: us-west-1) |

The AWS credentials are used by the `/workflow/:id/trace-log` endpoint to fetch remote trace files stored in S3.

## Editing the API

**Source of truth**: `src/index.js` with `@swagger` JSDoc comments

**Workflow**:

1. Edit Express routes in `src/index.js`;
2. Edit _@swagger_ comments in the same file to match the new API state;
3. When building, those comments will generate the `openapi.json` file.

**Do not manually edit** `openapi.json` - changes will be overwritten.

## OpenAPI Specification

View the full API spec in `openapi.json` or use tools like Swagger UI.
