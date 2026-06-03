---
"@outputai/core": patch
---

Added worker telemetry logs: print Temporal worker status and node memory every X ms, configured by `OUTPUT_WORKER_TELEMETRY_INTERVAL_MS` env var. Default `0` - off.

Message examples:
### Dev
```
[info] Telemetry: Worker { status: { runState: "RUNNING", numHeartbeatingActivities: 0, workflowPollerState: "POLLING", activityPollerState: "POLLING", hasOutstandingWorkflowPoll: true, hasOutstandingActivityPoll: true, numCachedWorkflows: 1, numInFlightWorkflowActivations: 0, numInFlightActivities: 0, numInFlightNonLocalActivities: 0, numInFlightLocalActivities: 0 }, memory: { availableMemory: 7500000000, constrainedMemory: 20000000000000000000, memoryUsage: { rss: 582348800, heapTotal: 400000000, heapUsed: 200000000, external: 800000000, arrayBuffers: 300000000 } } }
```

### Prod
```json
{
  "environment": "production",
  "level": "info",
  "memory": {
    "availableMemory": 7500000000,
    "constrainedMemory": 20000000000000000000,
    "memoryUsage": {
      "arrayBuffers": 1445268,
      "external": 800000000,
      "heapTotal": 400000000,
      "heapUsed": 200000000,
      "rss": 300000000
      }
    },
  "message": "Worker",
  "namespace": "Telemetry",
  "service": "output-worker",
  "status": {
    "activityPollerState": "POLLING",
    "hasOutstandingActivityPoll": true,
    "hasOutstandingWorkflowPoll": true,
    "numCachedWorkflows": 1,
    "numHeartbeatingActivities": 0,
    "numInFlightActivities": 0,
    "numInFlightLocalActivities": 0,
    "numInFlightNonLocalActivities": 0,
    "numInFlightWorkflowActivations": 0,
    "runState": "RUNNING",
    "workflowPollerState": "POLLING"
  },
  "timestamp": "2026-06-02T21:54:29.261+00:00"
}
```

