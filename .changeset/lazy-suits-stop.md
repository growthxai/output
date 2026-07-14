---
"@outputai/core": minor
---

## Workflow Activity Invocation

- Refactored workflow activity invocation so steps, evaluators, and shared activities use the same runtime dispatcher
instead of `this`-based handler dispatch.

  Workflow handlers no longer need to be rewritten from arrow functions into regular functions for activity dispatch,
  reducing AST rewrite complexity during worker startup and making bundling more predictable.

- Step and evaluator calls can now be placed in helper functions and imported helper modules used by a workflow.
  Helpers no longer need to pass a workflow-bound `this` value through their call chain.

## Child Workflow Activity Options

- A child workflow's definition-level `options.activityOptions` now override activity options inherited from its parent. Invocation-level `activityOptions` still override both, and a step or evaluator's own `options.activityOptions` remain the most specific.

- If a parent must override a child's retry or timeout configuration, pass `activityOptions` explicitly when invoking the child workflow.

## Shared Activity Namespaces

- Removed the previous `"$shared"` activity namespace by registering shared activities into each workflow namespace. This means workflows can call local and shared activities through the same activity resolution path.

- Shared activity types now use `"<workflow-name>#<activity-name>"` instead of `"$shared#<activity-name>"`.

- Added validation that prevents workflow-scoped activities from using the same activity name as a shared activity. If a workflow defines an activity with the same name as a shared activity, worker startup now fails validation instead of allowing ambiguous activity resolution.

## Workflow Code Validation

- Added fail-fast validation for default exports and `export *` declarations in steps/evaluators files. Steps and evaluators already needed to be exposed through named exports for workflow rewriting. The worker now reports these unsupported forms directly during startup.

  ```js
  // valid
  export const foo = step( { name: 'foo' } );

  // invalid
  export default step( { name: 'foo' } );
  export * from './other_steps.js';
  ```

- Added fail-fast validation for unsupported steps/evaluators import shapes. Imports from steps/evaluators files already needed to use named imports or destructured requires for workflow rewriting.

  The worker now fails fast with a validation error for unsupported import shapes like default imports, namespace imports, or non-destructured requires.

  ```js
  // valid
  import { foo } from './steps.js';
  const { bar } = require( './evaluators.js' );

  // invalid
  import foo from './steps.js';
  import * as steps from './steps.js';
  const steps = require( './steps.js' );
  ```

- Added validation that activity calls must happen inside functions.
  Calling a step or evaluator at module top level now fails validation.

  ```js
  import { foo } from './steps.js';

  // invalid
  foo();
  ```
