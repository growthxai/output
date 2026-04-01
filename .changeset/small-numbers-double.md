---
"@outputai/cli": patch
---

New commands to the package.json generated via the CLI and locally on the test_workflows/:
- `output:worker`: Executes all the above
- `output:worker:watch` Executes all the above using nodemon to watch for changes

Also, setting fixed version of the dependencies at the CLI-generated package.json.
