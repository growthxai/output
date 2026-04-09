---
name: output-dev-code-style
description: Code style conventions for Output SDK projects. Use when writing or reviewing any TypeScript/JavaScript code to ensure it follows project formatting rules.
allowed-tools: [Read]
---

# Code Style Conventions

## Overview

All Output SDK projects enforce a consistent code style via ESLint. Generated code must follow these rules so it passes linting without manual cleanup.

## When to Use This Skill

- Writing any TypeScript or JavaScript code in a workflow project
- Reviewing generated code before delivery
- Fixing lint errors after generation

## Rules

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

// CORRECT - IIFE for complex cases
const content = await ( async () => {
  try {
    return await fetchContent( url );
  } catch {
    return '[Content unavailable]';
  }
} )();

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

Single-parameter arrow functions must not have parentheses. Use parens only for zero, multiple, or destructured parameters.

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

## Quick Reference

| Rule | Correct | Wrong |
|------|---------|-------|
| Trailing comma | `{ a: 1 }` | `{ a: 1, }` |
| Variable declaration | `const x = 1` | `let x = 1` |
| Single-param arrow | `x => x.id` | `( x ) => x.id` |
| Operator linebreak | `a +\n  b` | `a\n  + b` |
| Parens spacing | `fn( x )` | `fn(x)` |

## Verification

Run `npm run lint` to check all style rules. Run `npm run lint:fix` to auto-fix most violations.
