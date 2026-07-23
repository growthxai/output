---
"output-api": minor
---

- Added support for new workflow results without wrappers and with trace information in `memo`;
- Added support for the new structured error format, including error details;
- Added the new workflow result format V2 while preserving support for legacy results:
  ```json
  {
    "v": "2",
    "workflowId": "xxx",
    "runId": "xxx",
    "status": "failed",
    "input": null,
    "output": null,
    "trace": {
      "local": "...",
      "remote": "..."
    },
    "error": {
      "name": "TypeError",
      "message": "fetch failed",
      "cause": {
        "name": "Error",
        "message": "getaddrinfo ENOTFOUND coolbeans.sofax",
        "errno": -3008,
        "code": "ENOTFOUND",
        "syscall": "getaddrinfo",
        "hostname": "coolbeans.sofax"
      }
    }
  }
  ```
