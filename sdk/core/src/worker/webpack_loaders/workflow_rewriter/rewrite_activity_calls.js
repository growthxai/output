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
const rewriteActivityCallsInFunctions = ( { ast, activityNames } ) => {
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
    }
  } );
};

// Calls belong to the call rewrite (function bodies) or the validator loader (top level).
const isCallee = path => path.parentPath.isCallExpression( { callee: path.node } );

// The activity import is stripped from the bundle, so non-call references become the activity name.
const rewriteActivityReferences = ( { ast, activityNames } ) => {
  traverse( ast, {
    Identifier: path => {
      const { name } = path.node;
      const activityName = activityNames.get( name );
      if ( !activityName || !path.isReferencedIdentifier() || isCallee( path ) || path.parentPath.isExportSpecifier() ) {
        return;
      }
      if ( hasLiveLocalBinding( path, name ) ) {
        return;
      }

      if ( path.parentPath.isObjectProperty( { shorthand: true } ) ) {
        path.parent.shorthand = false;
      }
      path.replaceWith( stringLiteral( activityName ) );
    }
  } );
};

// Entry point: resolve collected component imports into dispatcher calls and activity names.
export default function rewriteActivityCalls( { ast, activityImports } ) {
  const activityNames = buildActivityNameMap( activityImports );
  if ( activityNames.size === 0 ) {
    return;
  }

  rewriteActivityCallsInFunctions( { ast, activityNames } );
  rewriteActivityReferences( { ast, activityNames } );
};
