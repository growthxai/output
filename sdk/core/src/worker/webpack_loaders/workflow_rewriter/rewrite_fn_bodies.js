import traverseModule from '@babel/traverse';
import { INVOKE_ACTIVITY_SYMBOL } from '#consts';
import {
  callExpression,
  identifier,
  isIdentifier,
  memberExpression,
  stringLiteral
} from '@babel/types';

// Handle CJS/ESM interop for Babel packages when executed as a webpack loader
const traverse = traverseModule.default ?? traverseModule;
const invokeActivitySymbolKey = Symbol.keyFor( INVOKE_ACTIVITY_SYMBOL );

if ( !invokeActivitySymbolKey ) {
  throw new Error( 'INVOKE_ACTIVITY_SYMBOL must be created with Symbol.for().' );
}

// Only direct function calls are rewritten. Member calls and dynamic callees stay untouched.
const isIdentifierCallee = cPath => isIdentifier( cPath.node.callee );

// Collapse collected activity imports into local identifier -> declared activity name.
const buildActivityNameMap = activityImports =>
  activityImports.reduce( ( map, { localName, activityName } ) => map.set( localName, activityName ), new Map() );

// Ignore calls when the imported binding has been shadowed by a live local binding.
const hasLiveLocalBinding = ( path, name ) => {
  const binding = path.scope.getBinding( name );
  return binding && !binding.path.removed;
};

const assertGlobalThisIsSafe = path => {
  if ( hasLiveLocalBinding( path, 'globalThis' ) ) {
    throw new Error( 'Cannot rewrite activity call because "globalThis" is shadowed in this scope.' );
  }
};

// Build the generated dispatcher call, preserving the original call arguments.
const createInvokeActivityCall = ( activityName, args ) =>
  callExpression(
    memberExpression(
      identifier( 'globalThis' ),
      callExpression(
        memberExpression(
          memberExpression( identifier( 'globalThis' ), identifier( 'Symbol' ) ),
          identifier( 'for' )
        ),
        [ stringLiteral( invokeActivitySymbolKey ) ]
      ),
      true
    ),
    [ stringLiteral( activityName ), ...args ]
  );

// Rewrite valid function-body activity calls; top-level call validation belongs to the validator loader.
const rewriteActivityCalls = ( { ast, activityNames } ) => {
  const state = { rewrote: false };

  traverse( ast, {
    CallExpression: path => {
      if ( !path.getFunctionParent() || !isIdentifierCallee( path ) ) {
        return;
      }

      const callee = path.node.callee;
      const activityName = activityNames.get( callee.name );
      if ( !activityName || hasLiveLocalBinding( path, callee.name ) ) {
        return;
      }

      assertGlobalThisIsSafe( path );
      path.replaceWith( createInvokeActivityCall( activityName, path.node.arguments ) );
      state.rewrote = true;
    }
  } );

  return state.rewrote;
};

// Entry point: resolve collected component imports into plain dispatcher calls.
export default function rewriteFnBodies( { ast, activityImports } ) {
  const activityNames = buildActivityNameMap( activityImports );
  if ( activityNames.size === 0 ) {
    return false;
  }

  return rewriteActivityCalls( { ast, activityNames } );
};
