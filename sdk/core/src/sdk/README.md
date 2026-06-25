## SDK integration API for Output packages

**THESE MODULES ARE NOT PUBLIC. DO NOT IMPORT THEM ON YOUR PROJECT.**

This folder contains integration helpers used by other Output SDK packages.

The two subfolders represent a hard Temporal boundary. Code imported by
workflow-bundled modules must only depend on `helpers`. Code that needs worker
or activity runtime state belongs in `runtime`.

Do not change these without reviewing call-sites.

### `helpers`

Helpers must be safe to import while Temporal workflows are bundled and executed
in the workflow sandbox.

Allowed:

- Stateless functions and namespace objects.
- Deterministic code with no runtime side effects at import time.
- Imports from other sandbox-safe helper modules.
- Small, dependency-free helpers for any deterministic computation that can run
  without worker or activity state.

Not allowed:

- Access to activity context, async storage, sinks, tracing state, workers, or
  clients.
- Imports from `@temporalio/activity`, `@temporalio/worker`, or Node-only APIs
  that cannot be bundled into workflow code.
- Process, filesystem, network, clock, randomness, or environment access unless
  the behavior is known to be safe and deterministic in the workflow sandbox.
- Any import chain that reaches `runtime`.

If a helper cannot satisfy these rules, put it in `runtime` instead.

### `runtime`

Runtime modules are for helpers that need Output or Temporal runtime state.

Use `runtime` for activity-only integrations such as context lookup, event
emission, tracing, async storage, worker state, sinks, and other behavior that is
not safe inside workflow-bundled code.

Runtime modules may depend on activity runtime APIs and internal state, but they
must not be imported by workflow-safe code.
