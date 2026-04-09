---
name: output-dev-code-style
description: Code style conventions for Output SDK workflow projects. Use when writing or reviewing any TypeScript/JavaScript code. Discovers the project's own linting rules first; falls back to Output SDK conventions when no linter is configured.
allowed-tools: [Read, Bash, Glob, Grep]
---

# Code Style Conventions

## Overview

Generated code must match the style of the project it lives in. Many projects use their own linter or formatter (ESLint, Prettier, Biome, etc.) with rule sets that differ from Output's defaults. **Always discover and follow the project's rules first.** Only fall back to the Output SDK conventions below when the project has no linter or formatter configured.

## When to Use This Skill

- Writing any TypeScript or JavaScript code in a workflow project
- Reviewing generated code before delivery
- Fixing lint errors after generation

## Rules Discovery (do this first)

Before writing or reviewing code, determine the project's style rules:

1. **Check for a linter config.** Look for `eslint.config.js`, `.eslintrc.*`, `biome.json`, `deno.json`, or similar in the project root.
2. **Check for a formatter config.** Look for `.prettierrc*`, `.editorconfig`, or formatter settings in `package.json`.
3. **Check for lint/format scripts.** Look in `package.json` for `lint`, `lint:fix`, `format`, or similar scripts.
4. **Read existing source files.** If no config exists, infer conventions from the existing code (comma style, quote style, indentation, semicolons, spacing).

### If the project has a linter or formatter

- Follow its rules. Do not apply Output SDK conventions that conflict.
- Run the project's lint/format command after generating code.
- If a rule is ambiguous, match the patterns in existing source files.

### If the project has no linter or formatter

- Apply the Output SDK Default Conventions below.
- Match any conventions already present in existing source files -- consistency with the repo takes priority over the defaults below.

## Output SDK Default Conventions

These rules reflect the Output SDK's own ESLint config. Apply them only when the project has no linter configured and no conflicting conventions are evident in existing code.

### No Trailing Commas

Never use trailing commas in objects, arrays, function parameters, or type definitions.

```typescript
// CORRECT
const config = {
  name: 'workflow',
  timeout: 30000
};

const items = [ 'a', 'b', 'c' ];

export const myStep = step( {
  name: 'myStep',
  inputSchema: MyInputSchema,
  outputSchema: MyOutputSchema,
  fn: async input => {
    return { result: input.value };
  }
} );
```

```typescript
// WRONG - trailing commas
const config = {
  name: 'workflow',
  timeout: 30000,  // <-- not allowed
}

const items = [ 'a', 'b', 'c', ]  // <-- not allowed
```

### No `let` Declarations

`let` is banned. Use `const` exclusively. When a value needs conditional assignment, use a ternary, an IIFE, or restructure the logic.

```typescript
// CORRECT - ternary
const label = count > 1 ? 'items' : 'item';

// CORRECT - named helper for complex cases
const fetchWithFallback = async url => {
  try {
    return await fetchContent( url );
  } catch {
    return '[Content unavailable]';
  }
};
const content = await fetchWithFallback( url );

// CORRECT - early return in a function
function resolve( input ) {
  if ( input.mode === 'fast' ) {
    return fastPath( input );
  }
  return standardPath( input );
}
```

```typescript
// WRONG
let content;  // <-- banned
try {
  content = await fetchContent( url );
} catch {
  content = '[Content unavailable]';
}

let label;  // <-- banned
if ( count > 1 ) {
  label = 'items';
} else {
  label = 'item';
}
```

### Arrow Parens Only When Needed

Single-parameter arrow functions must not have parentheses. Use parens only for zero, multiple, destructured parameters, or when a TypeScript return type annotation is present.

```typescript
// CORRECT
items.map( item => item.id )
items.filter( s => s.url )
items.forEach( x => console.log( x ) )
fn: async input => { ... }

// Parens required for these cases:
items.reduce( ( acc, item ) => acc + item, 0 )
const run = ( { name, id } ) => `${name}-${id}`;
const noop = () => {};
fn: async ( input ): Promise<WorkflowOutput> => { ... }  // return type annotation
```

```typescript
// WRONG - unnecessary parens on single param
items.map( ( item ) => item.id )
items.filter( ( s ) => s.url )
fn: async ( input ) => { ... }
```

### `prefer-const`

Always use `const`. If a binding is never reassigned, it must be `const`.

### Operator Linebreak After

When an expression spans multiple lines, the operator stays on the first line.

```typescript
// CORRECT
const result = longExpression +
  anotherExpression;

const isValid = conditionA &&
  conditionB &&
  conditionC;

const value = condition ?
  trueResult :
  falseResult;
```

```typescript
// WRONG - operator on next line
const result = longExpression
  + anotherExpression;
```

### Spacing

- **Space in parens**: `fn( x )` not `fn(x)`, except empty parens `fn()`
- **Space in brackets**: `[ 'a', 'b' ]` not `['a', 'b']`
- **Space in braces**: `{ key: value }` not `{key: value}`
- **Indent**: 2 spaces
- **Quotes**: single quotes
- **Semicolons**: always

### File and Folder Naming

- All file names: `snake_case` (e.g., `fetch_data.ts`, `html_renderer.ts`)
- All folder names: `snake_case` (e.g., `ai_hn_digest`, `shared_utils`)
- Exceptions: config files (`vitest.config.js`, `eslint.config.js`)

## Quick Reference (Output SDK defaults)

| Rule | Correct | Wrong |
|------|---------|-------|
| Trailing comma | `{ a: 1 }` | `{ a: 1, }` |
| Variable declaration | `const x = 1` | `let x = 1` |
| Single-param arrow | `x => x.id` | `( x ) => x.id` |
| Operator linebreak | `a +\n  b` | `a\n  + b` |
| Parens spacing | `fn( x )` | `fn(x)` |

## Verification

1. If the project has a lint command (`npm run lint`, `npx eslint`, etc.), run it and fix any violations.
2. If the project has a format command (`npm run format`, `npx prettier --write`, etc.), run it.
3. If neither exists, review the generated code against existing source files in the repo for consistency.
