---
"@outputai/cli": minor
---

Add TUI attaching and re-attaching and `dev down` teardown command

`output dev` now detects an existing stack with `docker compose ps` instead of an
unconditional host-port probe, so a re-run attaches to a running project stack
rather than aborting on a collision with its own containers. Attached sessions
leave the stack up on quit; `output dev down` stops it.

A stack whose containers are all stopped counts as a fresh start, not an attach —
`output dev` restarts it in the foreground and still tears it down on quit.

`output dev -d` gained the pre-flight port probe the foreground path has. This
matters on Docker Desktop, where a non-container process holding a published port
does not fail `compose up -d`: the container starts and the port keeps answering
the other process, with no error from Docker.

Note: `-d` now pipes Docker's output rather than inheriting the terminal, so
Docker drops its redrawing progress bars for plain scrolling lines.
