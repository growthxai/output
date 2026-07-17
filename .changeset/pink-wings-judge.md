---
"@outputai/http": minor
---

## HTTP clients

- Replaced `fetch` with `instrumentedFetch`, the explicitly named Fetch-compatible API for traced HTTP requests.
  - Uses Undici as its canonical internal implementation while accepting Node and Undici `Request` inputs and request options containing either realm's `Headers` or `FormData` objects.
  - Normalizes Node request objects at the API boundary instead of replacing Node's global Fetch classes with `undici.install()`.
  - Rejects mixed request families, such as a Node `Request` combined with Undici `FormData`.
  - Removed the top-level `RequestInfo` and `RequestInit` type exports.
  ```ts
  import { instrumentedFetch } from '@outputai/http';

  const response = await instrumentedFetch( 'https://api.example.com/status' );
  ```

- Replaced `httpClient` with `createKyClient`, which returns a standard Ky client configured to use `instrumentedFetch`.
  - Upgraded Ky from 1.14.3 to 2.0.2. Public Ky behavior now follows Ky 2, including the `prefix` option, state-object hook arguments, empty-response JSON parsing, `searchParams` merging, and pre-parsed `HTTPError.data`.
  - Removed the top-level `HTTPError`, `TimeoutError`, `HttpClientOptions` exports.
  - Added the complete Ky namespace as a named export `ky`.
  ```ts
  import { createKyClient, type ky } from '@outputai/http';

  const options: ky.Options = {
    prefix: 'https://api.example.com',
    timeout: 30_000
  };
  const client: ky.KyInstance = createKyClient( options );
  ```

- Changed Ky and Undici from bundled dependencies to peer dependencies.
