import parser from '@babel/parser';
import { resolve as resolvePath } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  blockStatement,
  callExpression,
  functionExpression,
  identifier,
  isArrowFunctionExpression,
  isAssignmentPattern,
  isBlockStatement,
  isCallExpression,
  isExportNamedDeclaration,
  isFunctionExpression,
  isIdentifier,
  isVariableDeclarator,
  isStringLiteral,
  isVariableDeclaration,
  isObjectExpression,
  memberExpression,
  returnStatement,
  stringLiteral,
  thisExpression,
  isExportDefaultDeclaration,
  isFunctionDeclaration
} from '@babel/types';
import { ComponentFile, NodeType } from './consts.js';

// Path pattern regexes - shared across multiple helper functions
const STEPS_FILE_REGEX = /(^|\/)steps\.js$/;
const STEPS_FOLDER_REGEX = /\/steps\/[^/]+\.js$/;
const EVALUATORS_FILE_REGEX = /(^|\/)evaluators\.js$/;
const EVALUATORS_FOLDER_REGEX = /\/evaluators\/[^/]+\.js$/;
const PATH_TRAVERSAL_REGEX = /\.\.\//;
const SHARED_PATH_REGEX = /\/shared\//;

/**
 * Resolve a relative module specifier against a base directory.
 * @param {string} fileDir - Base directory to resolve from.
 * @param {string} rel - Relative path/specifier.
 * @returns {string} Absolute path.
 */
export const toAbsolutePath = ( fileDir, rel ) => resolvePath( fileDir, rel );

/**
 * Parse JavaScript/TypeScript source into a Babel AST.
 * @param {string} source - Source code to parse.
 * @param {string} filename - Virtual filename for sourcemaps and diagnostics.
 * @returns {import('@babel/types').File} Parsed AST.
 */
export const parse = ( source, filename ) => parser.parse( source, {
  sourceType: 'module',
  sourceFilename: filename,
  plugins: [ 'jsx' ]
} );

/**
 * Extract top-level constant string bindings (e.g., const NAME = 'value').
 * @param {import('@babel/types').File} ast - Parsed file AST.
 * @returns {Map<string, string>} Map from identifier to string literal value.
 */
export const extractTopLevelStringConsts = ast =>
  ast.program.body
    .filter( node => isVariableDeclaration( node ) && node.kind === NodeType.CONST )
    .reduce( ( map, node ) => {
      node.declarations
        .filter( dec => isIdentifier( dec.id ) && isStringLiteral( dec.init ) )
        .forEach( dec => map.set( dec.id.name, dec.init.value ) );
      return map;
    }, new Map() );

/**
 * Resolve an object key name from an Identifier or StringLiteral.
 * @param {import('@babel/types').Expression} node - Object key node.
 * @returns {string|null} Key name or null when unsupported.
 */
export const getObjectKeyName = node => {
  if ( isIdentifier( node ) ) {
    return node.name;
  }
  if ( isStringLiteral( node ) ) {
    return node.value;
  }
  return null;
};

/**
 * Extract the local identifier name from a destructured ObjectProperty.
 * Supports: { a } and { a: local } and { a: local = default }.
 * @param {import('@babel/types').ObjectProperty} prop - Object property.
 * @returns {string|null} Local identifier name or null.
 */
export const getLocalNameFromDestructuredProperty = prop => {
  if ( isIdentifier( prop.value ) ) {
    return prop.value.name;
  }
  if ( isAssignmentPattern( prop.value ) && isIdentifier( prop.value.left ) ) {
    return prop.value.left.name;
  }
  return null;
};

/**
 * Convert an ArrowFunctionExpression to a FunctionExpression.
 * Wraps expression bodies in a block with a return statement.
 * @param {import('@babel/types').ArrowFunctionExpression} arrow - Arrow function.
 * @returns {import('@babel/types').FunctionExpression} Function expression.
 */
export const toFunctionExpression = arrow => {
  const body = isBlockStatement( arrow.body ) ? arrow.body : blockStatement( [ returnStatement( arrow.body ) ] );
  return functionExpression( null, arrow.params, body, arrow.generator ?? false, arrow.async ?? false );
};

/**
 * Check if a module specifier or request string points to steps.js or is in a steps folder.
 * Matches: steps.js, /steps.js, /steps/*.js
 * This matches LOCAL steps only (no path traversal).
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches a local steps path.
 */
export const isStepsPath = value => {
  // Exclude shared steps (paths with ../ or containing /shared/)
  if ( PATH_TRAVERSAL_REGEX.test( value ) || SHARED_PATH_REGEX.test( value ) ) {
    return false;
  }
  return STEPS_FILE_REGEX.test( value ) || STEPS_FOLDER_REGEX.test( value );
};

/**
 * Check if a module specifier or request string points to shared steps.
 * Shared steps are steps imported from outside the current workflow directory.
 * Matches paths with ../ traversal or /shared/ and containing steps pattern.
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches a shared steps path.
 */
export const isSharedStepsPath = value => {
  const hasStepsPattern = STEPS_FILE_REGEX.test( value ) || STEPS_FOLDER_REGEX.test( value );
  if ( !hasStepsPattern ) {
    return false;
  }
  return PATH_TRAVERSAL_REGEX.test( value ) || SHARED_PATH_REGEX.test( value );
};

/**
 * Check if a path matches any steps pattern (local or shared).
 * Used for validation purposes.
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches any steps path pattern.
 */
export const isAnyStepsPath = value =>
  STEPS_FILE_REGEX.test( value ) || STEPS_FOLDER_REGEX.test( value );

/**
 * Check if a module specifier or request string points to evaluators.js or is in an evaluators folder.
 * Matches: evaluators.js, /evaluators.js, /evaluators/*.js
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches an evaluators path.
 */
export const isEvaluatorsPath = value => {
  // Exclude shared evaluators (paths with ../ or containing /shared/)
  if ( PATH_TRAVERSAL_REGEX.test( value ) || SHARED_PATH_REGEX.test( value ) ) {
    return false;
  }
  return EVALUATORS_FILE_REGEX.test( value ) || EVALUATORS_FOLDER_REGEX.test( value );
};

/**
 * Check if a module specifier or request string points to shared evaluators.
 * Shared evaluators are evaluators imported from outside the current workflow directory.
 * Matches paths with ../ traversal or /shared/ and containing evaluators pattern.
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches a shared evaluators path.
 */
export const isSharedEvaluatorsPath = value => {
  const hasEvaluatorsPattern = EVALUATORS_FILE_REGEX.test( value ) || EVALUATORS_FOLDER_REGEX.test( value );
  if ( !hasEvaluatorsPattern ) {
    return false;
  }
  return PATH_TRAVERSAL_REGEX.test( value ) || SHARED_PATH_REGEX.test( value );
};

/**
 * Check if a path matches any evaluators pattern (local or shared).
 * Used for validation purposes.
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches any evaluators path pattern.
 */
export const isAnyEvaluatorsPath = value =>
  EVALUATORS_FILE_REGEX.test( value ) || EVALUATORS_FOLDER_REGEX.test( value );

/**
 * Check if a module specifier or request string points to workflow.js.
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches workflow.js.
 */
export const isWorkflowPath = value => /(^|\/)workflow\.js$/.test( value );

/**
 * Check if a path is a component file (steps, evaluators, or workflow).
 * @param {string} value - Module path or request string.
 * @returns {boolean} True if it matches any component file path.
 */
export const isComponentFile = value =>
  isAnyStepsPath( value ) || isAnyEvaluatorsPath( value ) || isWorkflowPath( value );

/**
 * Determine file kind based on its path.
 * Returns the component type if it's a component file, null otherwise.
 * @param {string} path
 * @returns {'workflow'|'steps'|'evaluators'|null}
 */
export const getFileKind = path => {
  if ( isAnyStepsPath( path ) ) {
    return ComponentFile.STEPS;
  }
  if ( isAnyEvaluatorsPath( path ) ) {
    return ComponentFile.EVALUATORS;
  }
  if ( isWorkflowPath( path ) ) {
    return ComponentFile.WORKFLOW;
  }
  return null;
};

/**
 * Create a `this.method(literalName, ...args)` CallExpression.
 * @param {string} method - Method name on `this`.
 * @param {string} literalName - First string literal argument.
 * @param {import('@babel/types').Expression[]} args - Remaining call arguments.
 * @returns {import('@babel/types').CallExpression} Call expression node.
 */
export const createThisMethodCall = ( method, literalName, args ) =>
  callExpression( memberExpression( thisExpression(), identifier( method ) ), [ stringLiteral( literalName ), ...args ] );

/**
 * Build a CallExpression that binds `this` at the call site:
 *   fn(arg1, arg2) -> fn.call(this, arg1, arg2)
 *
 * When to use:
 * - Inside workflow `fn` rewriting, local call-chain functions must receive the dynamic `this`
 *   so that emitted `this.invokeStep(...)` and similar calls inside them operate correctly.
 *
 * Example:
 *   // Input AST intent:
 *   foo(a, b);
 *
 *   // Rewritten AST:
 *   foo.call(this, a, b);
 *
 * @param {string} calleeName - Identifier name of the function being called (e.g., 'foo').
 * @param {import('@babel/types').Expression[]} args - Original call arguments.
 * @returns {import('@babel/types').CallExpression} CallExpression node representing `callee.call(this, ...args)`.
 */
export const bindThisAtCallSite = ( calleeName, args ) =>
  callExpression( memberExpression( identifier( calleeName ), identifier( 'call' ) ), [ thisExpression(), ...args ] );

/**
 * Resolve an options object's name property to a string.
 * Accepts literal strings or top-level const string identifiers.
 * @param {import('@babel/types').Expression} optionsNode - The call options object.
 * @param {Map<string,string>} consts - Top-level const string bindings.
 * @param {string} errorMessagePrefix - Prefix used when throwing validation errors.
 * @returns {string} Resolved name.
 * @throws {Error} When name is missing or not a supported static form.
 */
export const resolveNameFromOptions = ( optionsNode, consts, errorMessagePrefix ) => {
  // If it is not an object
  if ( !isObjectExpression( optionsNode ) ) {
    throw new Error( `${errorMessagePrefix}: Missing properties` );
  }

  // Look specifically for the 'name' property
  for ( const prop of optionsNode.properties ) {
    if ( getObjectKeyName( prop.key ) !== 'name' ) {
      continue;
    }

    const val = prop.value;
    // if it is a string literal: jackpot
    if ( isStringLiteral( val ) ) {
      return val.value;
    }

    // if it is an identifier, it needs to be deterministic (top-level const)
    if ( isIdentifier( val ) ) {
      if ( consts.has( val.name ) ) {
        return consts.get( val.name );
      }
      throw new Error( `${errorMessagePrefix}: Name identifier "${val.name}" is not a top-level const string` );
    }

    throw new Error( `${errorMessagePrefix}: Name must be a string literal or a top-level const string` );
  }

  throw new Error( `${errorMessagePrefix}: Missing required name property` ); // No name field found
};

/**
 * Resolve a name from the first argument of a factory call.
 * Handles two patterns:
 * - String literal first arg: `verify('name', fn)` → returns 'name'
 * - Identifier referencing top-level const: `verify(NAME, fn)` → resolves const
 * - Object with name property: `evaluator({ name: '...' })` → delegates to resolveNameFromOptions
 *
 * @param {import('@babel/types').Expression} argNode - First argument to the factory call.
 * @param {Map<string,string>} consts - Top-level const string bindings.
 * @param {string} errorMessagePrefix - Prefix used when throwing validation errors.
 * @returns {string} Resolved name.
 * @throws {Error} When name is missing or not a supported static form.
 */
export const resolveNameFromArg = ( argNode, consts, errorMessagePrefix ) => {
  if ( isStringLiteral( argNode ) ) {
    return argNode.value;
  }
  if ( isIdentifier( argNode ) && consts.has( argNode.name ) ) {
    return consts.get( argNode.name );
  }
  return resolveNameFromOptions( argNode, consts, errorMessagePrefix );
};

/**
 * Build a map of exported component identifiers to declared names by scanning a module.
 * Matches any `export const X = identifier(...)` pattern — the callee name is intentionally
 * unchecked because:
 * - File path scoping (steps.js, evaluators.js) already constrains which files are parsed
 * - External packages may define custom factory wrappers (e.g., verify() wraps evaluator())
 * - Runtime metadata validation is the authoritative check for component type
 * - Name extraction (resolveNameFromArg) rejects calls without a static name argument
 *
 * @param {object} params
 * @param {string} params.path - Absolute path to the module file.
 * @param {Map<string, Map<string,string>>} params.cache - Cache for memoizing results by file path.
 * @param {string} params.invalidMessagePrefix - Prefix used in thrown errors when name is invalid.
 * @returns {Map<string,string>} Map of `exportedIdentifier` -> `declaredName`.
 * @throws {Error} When names are missing, dynamic, or otherwise non-static.
 */
const buildComponentNameMap = ( { path, cache, invalidMessagePrefix } ) => {
  if ( cache.has( path ) ) {
    return cache.get( path );
  }
  const text = readFileSync( path, 'utf8' );
  const ast = parse( text, path );
  const consts = extractTopLevelStringConsts( ast );

  const result = ast.program.body
    .filter( node => isExportNamedDeclaration( node ) && isVariableDeclaration( node.declaration ) )
    .reduce( ( map, node ) => {
      node.declaration.declarations
        .filter( dec => isIdentifier( dec.id ) && isCallExpression( dec.init ) && isIdentifier( dec.init.callee ) )
        .map( dec => [
          dec,
          resolveNameFromArg( dec.init.arguments[0], consts, `${invalidMessagePrefix} ${path} for "${dec.id.name}"` )
        ] )
        .forEach( ( [ dec, name ] ) => map.set( dec.id.name, name ) );
      return map;
    }, new Map() );

  cache.set( path, result );
  return result;
};

export const buildStepsNameMap = ( path, cache ) => buildComponentNameMap( {
  path,
  cache,
  invalidMessagePrefix: 'Invalid step name in'
} );

/**
 * Build a map from exported shared step identifier to declared step name.
 * Same as buildStepsNameMap but for shared steps.
 *
 * @param {string} path - Absolute path to the shared steps module file.
 * @param {Map<string, Map<string,string>>} cache - Cache of computed step name maps.
 * @returns {Map<string,string>} Exported identifier -> step name.
 * @throws {Error} When a step name is invalid (non-static or missing).
 */
export const buildSharedStepsNameMap = ( path, cache ) => buildComponentNameMap( {
  path,
  cache,
  invalidMessagePrefix: 'Invalid shared step name in'
} );

/**
 * Build a map from exported evaluator identifier to declared evaluator name.
 * Matches `export const X = evaluator({ name: '...' })` and wrapper patterns
 * like `export const X = verify('name', fn)`.
 *
 * @param {string} path - Absolute path to the evaluators module file.
 * @param {Map<string, Map<string,string>>} cache - Cache of computed evaluator name maps.
 * @returns {Map<string,string>} Exported identifier -> evaluator name.
 * @throws {Error} When a evaluator name is invalid (non-static or missing).
 */
export const buildEvaluatorsNameMap = ( path, cache ) => buildComponentNameMap( {
  path,
  cache,
  invalidMessagePrefix: 'Invalid evaluator name in'
} );

/**
 * Build a map from exported shared evaluator identifier to declared evaluator name.
 * Same as buildEvaluatorsNameMap but for shared evaluators.
 *
 * @param {string} path - Absolute path to the shared evaluators module file.
 * @param {Map<string, Map<string,string>>} cache - Cache of computed evaluator name maps.
 * @returns {Map<string,string>} Exported identifier -> evaluator name.
 * @throws {Error} When an evaluator name is invalid (non-static or missing).
 */
export const buildSharedEvaluatorsNameMap = ( path, cache ) => buildComponentNameMap( {
  path,
  cache,
  invalidMessagePrefix: 'Invalid shared evaluator name in'
} );

/**
 * Build a structure with default and named workflow names from a workflow module.
 * Extracts names from `workflow({ name: '...' })` calls.
 * @param {string} path - Absolute path to the workflow module file.
 * @param {Map<string, {default: (string|null), named: Map<string,string>}>} cache - Cache of workflow names.
 * @returns {{ default: (string|null), named: Map<string,string> }} Names.
 * @throws {Error} When a workflow name is invalid (non-static or missing).
 */
export const buildWorkflowNameMap = ( path, cache ) => {
  if ( cache.has( path ) ) {
    return cache.get( path );
  }
  const text = readFileSync( path, 'utf8' );
  const ast = parse( text, path );
  const consts = extractTopLevelStringConsts( ast );

  const result = { default: null, named: new Map() };

  for ( const node of ast.program.body ) {

    // named exports
    if ( isExportNamedDeclaration( node ) && isVariableDeclaration( node.declaration ) ) {

      for ( const d of node.declaration.declarations ) {
        if ( isIdentifier( d.id ) && isCallExpression( d.init ) && isIdentifier( d.init.callee ) ) {
          const name = resolveNameFromArg( d.init.arguments[0], consts, `Invalid workflow name in ${path} for '${d.id.name}` );
          if ( name ) {
            result.named.set( d.id.name, name );
          }
        }
      }

    // default exports
    } else if (
      isExportDefaultDeclaration( node ) &&
      isCallExpression( node.declaration ) &&
      isIdentifier( node.declaration.callee )
    ) {
      result.default = resolveNameFromArg( node.declaration.arguments[0], consts, `Invalid default workflow name in ${path}` );
    }
  }

  cache.set( path, result );
  return result;
};

/**
 * Determine whether a node represents a function body usable as a workflow `fn`.
 *
 * Why this matters:
 * - Workflow `fn` needs a dynamic `this` so the rewriter can emit calls like `this.invokeStep(...)`.
 * - Arrow functions do not have their own `this`; they capture `this` lexically, which breaks the runtime contract.
 *
 * Accepts:
 * - FunctionExpression (possibly async/generator), e.g.:
 *   const obj = {
 *     fn: async function (input) {
 *       return input;
 *     }
 *   };
 *
 * Rejects:
 * - ArrowFunctionExpression, e.g.:
 *   const obj = {
 *     fn: async (input) => input
 *   };
 *
 * - Any other non-function expression.
 *
 * Notes:
 * - The rewriter will proactively convert arrow `fn` to a FunctionExpression before further processing.
 *
 * @param {import('@babel/types').Expression} v - Candidate node for `fn` value.
 * @returns {boolean} True if `v` is a FunctionExpression and not an arrow function.
 */
export const isFunction = v => isFunctionExpression( v ) && !isArrowFunctionExpression( v );

/**
 * Determine whether a variable declarator represents a function-like value.
 *
 * Use case:
 * - When `fn` calls a locally-declared function (directly or transitively), we need to:
 *   - propagate `this` to that function call (`callee.call(this, ...)`)
 *   - traverse into that function's body to rewrite imported step/workflow/evaluator calls.
 *
 * Matches patterns like:
 * - Function expression:
 *   const foo = function (x) { return x + 1; };
 *
 * - Async/generator function expression:
 *   const foo = async function (x) { return await work(x); };
 *
 * - Arrow function (will be normalized to FunctionExpression by the rewriter):
 *   const foo = (x) => x + 1;
 *   const foo = async (x) => await work(x);
 *
 * Does not match:
 * - Non-function initializers:
 *   const foo = 42;
 *   const foo = someIdentifier;
 *
 * @param {import('@babel/types').Node} v - AST node (typically a VariableDeclarator).
 * @returns {boolean} True if the declarator's initializer is a function (arrow or function expression).
 */
export const isVarFunction = v =>
  isVariableDeclarator( v ) && ( isFunctionExpression( v.init ) || isArrowFunctionExpression( v.init ) );

/**
 * Determine whether a binding node corresponds to a function-like declaration usable
 * as a call-chain function target during workflow rewriting.
 *
 * Matches:
 * - FunctionDeclaration:
 *     function foo(x) { return x + 1; }
 *
 * - VariableDeclarator initialized with a function or arrow (normalized later):
 *     const foo = function (x) { return x + 1; };
 *     const foo = (x) => x + 1;
 *
 * Non-matches:
 * - Any binding that is not a function declaration nor a variable declarator with a function initializer.
 *
 * Why this matters:
 * - The rewriter traverses call chains from the workflow `fn`. It must recognize which local
 *   callees are valid function bodies to rewrite and into which it can propagate `this`.
 *
 * @param {import('@babel/types').Node} node - Binding path node (FunctionDeclaration or VariableDeclarator).
 * @returns {boolean} True if the node represents a function-like binding.
 */
export const isFunctionLikeBinding = node =>
  isFunctionDeclaration( node ) ||
  (
    isVariableDeclarator( node ) &&
    ( isFunctionExpression( node.init ) || isArrowFunctionExpression( node.init ) )
  );
