---
"@outputai/cli": minor
---

Added `--workflow-id` to `workflow dataset generate`: it reads the start input and the result of a completed run from Temporal and saves them as a dataset case, so a real run can become a test case without reading traces or going through the API for the run data. It works on local and remote Temporal. The case is named after the workflow id unless `--name` is given. If the file already has a case with that name, its `input` and `last_output` are replaced and its other fields, such as `ground_truth`, are kept, as in the other modes. A run that started without input is saved with an empty input, and a run that returned nothing is saved with a `null` output. A run that continued as new from earlier runs is saved with the input of the first run of the chain and the result of the run read, and the command prints the run ids it used. It fails if the first run can no longer be read.

Added `--run-id` (`-r`) to read a run other than the latest one of the workflow id. It needs `--workflow-id`.

Added `--profile`, `--address` and `--namespace` to choose the Temporal backend, with the same precedence as `workflow debug`: the flags, then the `TEMPORAL_*` environment variables, then the profile in `temporal.toml`, then the local dev defaults.

Added checks before anything is written. The run must be a completed run of the workflow named in the command, and its input must be an object. A run of another workflow type, a run that is running, failed, canceled, terminated or continued as new into a later run, a missing run, an unreachable Temporal and an input that is not an object each fail with a clear message on stderr and a non-zero exit, and no file is created. Input and result are read in full, and secrets are redacted as in the other modes.

Added a 30 second deadline on every Temporal call, shared with `workflow debug`, so an unresponsive server fails the command with `Temporal did not answer within 30s` instead of hanging.

Changed the scenario and `--input` modes of `workflow dataset generate` to stop reading the trace. They save only the output and the date, so they work when tracing is off.

Removed `--trace`, `--download` and `--limit` from `workflow dataset generate`. This is breaking: passing them is now an error. Use `--workflow-id` instead, one command per run (`workflow runs list` prints the workflow ids). The old modes read local trace files and the API's trace log.

Removed `executionTimeMs` from the datasets the CLI writes, including the output of `workflow test`. Nothing read it. Dataset files that still contain it load without error, and the key disappears the next time the CLI rewrites the file.
