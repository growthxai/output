---
"@outputai/cli": patch
---

Restore the terminal on abnormal `output dev` exit. Uncaught exceptions and unhandled rejections now leave the alternate-screen buffer and unmount the TUI before exiting, so scrollback and the error stack stay readable.
