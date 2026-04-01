---
"@outputai/cli": patch
---

New commands to the package.json generated via the CLI and locally on the test_workflows/:
- `worker:install`: Installs the dependencies;
- `worker:build`: Compiles the ts files to js, copy assets;
- `worker:start`: Start the worker
- `worker`: Executes all the above
- `worker:watch` Executes all the above using nodemon to watch for changes

Also, setting fixed version of the dependencies at the CLI-generated package.json.
