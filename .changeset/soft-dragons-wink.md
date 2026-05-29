---
"@outputai/core": minor
---

- Removed property `.attributes` from workflow result wrapper object: Workflows will no longer accumulate or expose attributes;
- Added `__output_workflow_wrapper_version=1` field on workflow wrapper object to better version it;
- Removed Signals-based communication between Activities and Workflows to share individual attributes:
  - Each activity now aggregates all attributes of the events that happened within it. This is returned in a new wrapper around the activity:
  ```js
  {
    __output_activity_wrapper_version: 1, // internal flag to indicate this wrapper's version
    output: ..., // the raw output from the activity
    aggregations: {  // aggregation object with total llm/http usage and cost from all requests of this activity
      cost: {
        total: 1 // total cost from all http and llm requests
      },
      tokens: { // breakdown of all llm tokens used
        total: 10,
        input: 3,
        cached_input: 1,
        output: 4,
        reasoning: 2
      },
      httpRequests: { // total number of http calls made
        total: 3
      }
    }
  }
  ```
  - Workflows now read these aggregations and merge them to create the final `.aggregations` object returned in its result, which is unchanged;
  - When Activities fail, a fallback Signal is sent with the aggregations so workflows can still compute them, avoiding data loss.
