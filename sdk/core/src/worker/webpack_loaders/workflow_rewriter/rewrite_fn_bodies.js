import traverseModule from '@babel/traverse';
import { isArrowFunctionExpression, isIdentifier } from '@babel/types';
import {
  toFunctionExpression,
  createThisMethodCall,
  isFunction,
  bindThisAtCallSite,
  isFunctionLikeBinding
} from '../tools.js';

// Handle CJS/ESM interop for Babel packages when executed as a webpack loader
const traverse = traverseModule.default ?? traverseModule;

/**
 * Check whether a CallExpression callee is a simple Identifier.
 * Only direct identifier calls are rewritten; member/dynamic calls are skipped.
 *
 * We only support rewriting `Foo()` calls that refer to imported steps/flows/evaluators
 * or local call-chain functions. Calls like `obj.Foo()` or `(getFn())()` are out of scope.
 *
 * Examples:
 * - Supported: `Foo()`
 * - Skipped:   `obj.Foo()`, `(getFn())()`
 *
 * @param {import('@babel/traverse').NodePath} cPath - Path to a CallExpression node.
 * @returns {boolean} True when callee is an Identifier.
 */
const isIdentifierCallee = cPath => isIdentifier( cPath.node.callee );

/**
 * Convert an ArrowFunctionExpression at the given path into a FunctionExpression
 * to ensure dynamic `this` semantics inside the function body.
 *
 * Workflow code relies on `this` to invoke steps/flows (e.g., `this.invokeStep(...)`).
 * Arrow functions capture `this` lexically, which would break that contract.
 *
 * If the node is an arrow, it is replaced by an equivalent FunctionExpression and
 * the `state.rewrote` flag is set. If not an arrow, this is a no-op.
 *
 * @param {import('@babel/traverse').NodePath} nodePath - Path to a function node.
 * @param {{ rewrote: boolean }} state - Mutation target to indicate a rewrite occurred.
 * @returns {void}
 */
const normalizeArrowToFunctionPath = ( nodePath, state ) => {
  if ( isArrowFunctionExpression( nodePath.node ) ) {
    nodePath.replaceWith( toFunctionExpression( nodePath.node ) );
    state.rewrote = true;
  }
};
/**
 * Rewrite calls inside a function body and collect call-chain functions discovered within.
 * - Imported calls (steps/shared/evaluators/flows) are rewritten to `this.invokeX` or `this.startWorkflow`.
 * - Local call-chain function calls are rewritten to `fn.call(this, ...)` to bind `this` correctly.
 * - Returns a map of call-chain function name -> binding path for further recursive processing.
 *
 * @param {import('@babel/traverse').NodePath} bodyPath - Path to a function's body node.
 * @param {Array<{ list: Array<any>, method: string, key: string }>} descriptors - Import rewrite descriptors.
 * @param {{ rewrote: boolean }} state - Mutable state used to flag that edits were performed.
 * @returns {Map<string, import('@babel/traverse').NodePath>} Discovered call-chain function bindings.
 */
const rewriteCallsInBody = ( bodyPath, descriptors, state ) => {
  const callChainFunctions = new Map();
  bodyPath.traverse( {
    CallExpression: cPath => {
      if ( !isIdentifierCallee( cPath ) ) {
        return; // Only identifier callees are supported (skip member/dynamic)
      }
      const callee = cPath.node.callee;

      // Rewrite imported calls (steps/shared/evaluators/flows)
      for ( const { list, method, key } of descriptors ) {
        const found = list.find( x => x.localName === callee.name );
        if ( found ) {
          const args = cPath.node.arguments;
          cPath.replaceWith( createThisMethodCall( method, found[key], args ) );
          state.rewrote = true;
          return;
        }
      }

      // Rewrite local call-chain function calls and track for recursive processing
      const binding = cPath.scope.getBinding( callee.name );
      if ( !binding ) {
        return;
      }
      if ( !isFunctionLikeBinding( binding.path.node ) ) {
        return; // Not a function-like binding
      }

      // Queue call-chain function for recursive processing
      if ( !callChainFunctions.has( callee.name ) ) {
        callChainFunctions.set( callee.name, binding.path );
      }

      // Bind `this` at callsite: fn(...) -> fn.call(this, ...)
      cPath.replaceWith( bindThisAtCallSite( callee.name, cPath.node.arguments ) );
      state.rewrote = true;
    }
  } );
  return callChainFunctions;
};

/**
 * Recursively process a call-chain function:
 * - Ensures the function is a FunctionExpression (converts arrow when needed).
 * - Rewrites calls inside the function using `rewriteCallsInBody`.
 * - Follows nested call-chain functions depth-first while avoiding cycles via `processedFns`.
 *
 * @param {object} params - Params for processing a call-chain function.
 * @param {string} params.name - Local identifier name in the current scope.
 * @param {import('@babel/traverse').NodePath} params.bindingPath - Binding path of the function declaration.
 * @param {{ rewrote: boolean }} params.state - Mutable state used to flag that edits were performed.
 * @param {Array<{ list: Array<any>, method: string, key: string }>} params.descriptors - Import rewrite descriptors.
 * @param {Set<string>} [params.processedFns] - Already processed names to avoid cycles.
 */
const processFunction = ( { name, bindingPath, state, descriptors, processedFns = new Set() } ) => {
  // Avoid infinite loops for recursive/repeated references
  if ( processedFns.has( name ) || bindingPath.removed ) {
    return;
  }
  processedFns.add( name );

  if ( bindingPath.isVariableDeclarator() ) {
    // Case 1: const foo = <function or arrow>
    const initPath = bindingPath.get( 'init' );
    // Arrow functions capture `this` lexically; normalize for dynamic `this`
    normalizeArrowToFunctionPath( initPath, state );
    // Rewrite calls in body; collect nested call-chain functions from this scope
    const callChainFunctions = rewriteCallsInBody( initPath.get( 'body' ), descriptors, state );
    // DFS: process nested call-chain functions (processedFns prevents cycles)
    callChainFunctions.forEach( ( childBindingPath, childName ) => {
      processFunction( { name: childName, bindingPath: childBindingPath, state, descriptors, processedFns } );
    } );
  } else if ( bindingPath.isFunctionDeclaration() ) {
    // Case 2: function foo(...) { ... }
    // Function declarations already have dynamic `this`; no normalization needed
    const callChainFunctions = rewriteCallsInBody( bindingPath.get( 'body' ), descriptors, state );
    // Continue DFS into any functions called from this declaration
    callChainFunctions.forEach( ( childBindingPath, childName ) => {
      processFunction( { name: childName, bindingPath: childBindingPath, state, descriptors, processedFns } );
    } );
  }
};

/**
 * Rewrite calls to imported steps/workflows within `fn` object properties.
 * Converts arrow fns to functions and replaces `StepX(...)` with
 * `this.invokeStep('name', ...)` and `FlowY(...)` with
 * `this.startWorkflow('name', ...)`.
 *
 * @param {object} params
 * @param {import('@babel/types').File} params.ast - Parsed file AST.
 * @param {Array<{localName:string,stepName:string}>} params.stepImports - Step imports.
 * @param {Array<{localName:string,stepName:string}>} params.sharedStepImports - Shared step imports.
 * @param {Array<{localName:string,evaluatorName:string}>} params.evaluatorImports - Evaluator imports.
 * @param {Array<{localName:string,workflowName:string}>} params.flowImports - Workflow imports.
 * @returns {boolean} True if the AST was modified; false otherwise.
 */
export default function rewriteFnBodies( { ast, stepImports, sharedStepImports = [], evaluatorImports, sharedEvaluatorImports = [], flowImports } ) {
  const state = { rewrote: false };
  // Build rewrite descriptors once per traversal
  const descriptors = [
    { list: stepImports, method: 'invokeStep', key: 'stepName' },
    { list: sharedStepImports, method: 'invokeSharedStep', key: 'stepName' },
    { list: evaluatorImports, method: 'invokeEvaluator', key: 'evaluatorName' },
    { list: sharedEvaluatorImports, method: 'invokeSharedEvaluator', key: 'evaluatorName' },
    { list: flowImports, method: 'startWorkflow', key: 'workflowName' }
  ];
  traverse( ast, {
    ObjectProperty: path => {
      // Only transform object properties named 'fn'
      if ( !isIdentifier( path.node.key, { name: 'fn' } ) ) {
        return;
      }

      const val = path.node.value;

      // Only functions (including arrows) are eligible
      if ( !isFunction( val ) && !isArrowFunctionExpression( val ) ) {
        return;
      }

      // Normalize arrow to function for correct dynamic `this`
      normalizeArrowToFunctionPath( path.get( 'value' ), state );

      // Rewrite the main workflow fn body and collect call-chain functions discovered within it
      const callChainFunctions = rewriteCallsInBody( path.get( 'value.body' ), descriptors, state );

      // Recursively rewrite call-chain functions and any functions they call
      callChainFunctions.forEach( ( bindingPath, name ) => {
        processFunction( { name, bindingPath, state, descriptors } );
      } );
    }
  } );
  return state.rewrote;
};
