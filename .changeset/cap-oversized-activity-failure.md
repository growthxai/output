---
"@outputai/core": patch
---

Activity failures larger than Temporal's 2 MB limit now fail the activity immediately, without retrying, and keep the real error. Before, the step's error was attached to the failure up to four times (message, stack, cause, details), so an error with a message over ~512 KB exceeded the limit. Temporal then replaced it with a generic "Failure exceeds size limit." and Temporal Cloud retried it for the step's whole retry policy, which could block a workflow for hours. The interceptor now measures the encoded failure and, when it is over the limit, throws a compact non-retryable `ApplicationFailure` with the original type and the message truncated to 16 KB.
