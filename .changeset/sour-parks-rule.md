---
"@outputai/core": patch
---

Improve trace error serialization to preserve nested error causes. Error entries in trace files now include the error `name`, `message`, `stack`, and recursively serialized `cause` values up to 10 levels deep, including JSON-safe non-Error causes where present.

```js
{
  name: "from error.constructor.name",
  message: "from error.message",
  stack: "from error.stack",
  cause: { // from .cause
    name: "from error.constructor.name",
    message: "from error.message",
    stack: "from error.stack",
    cause: {
      ... // up to 10 levels
    }
  }
}
```
