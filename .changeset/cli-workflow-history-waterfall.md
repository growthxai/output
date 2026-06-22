---
"@outputai/cli": patch
---

Add `output workflow history <workflowId>` — renders a run's step timeline as a terminal waterfall (each step's start offset and duration), mirroring the Agents HQ Timeline view. It pages the `GET /workflow/{id}/history` endpoint and correlates the Temporal events into per-step spans (numbering parallel fan-outs `#1..#N`). `--format json` emits the structured spans, `--raw` prints the endpoint's verbatim response, and `--run-id`, `--include-payloads`, `--width`, and `--no-color` are supported.
