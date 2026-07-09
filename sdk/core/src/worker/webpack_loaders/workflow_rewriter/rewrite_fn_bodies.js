import traverseModule from '@babel/traverse';
import {
  callExpression,
  identifier,
  importDeclaration,
  importSpecifier,
  isIdentifier,
  stringLiteral
} from '@babel/types';

// Handle CJS/ESM interop for Babel packages when executed as a webpack loader
const traverse = traverseModule.default ?? traverseModule;

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

// Reserve a collision-safe binding name for the internal activity dispatcher.
const generateInvokeActivityIdentifier = ast => {
  const state = { localIdentifier: null };
  traverse( ast, {
    Program: path => {
      state.localIdentifier = path.scope.generateUidIdentifier( 'invokeActivity' );
      path.stop();
    }
  } );
  return state.localIdentifier;
};

// Add the dispatcher import only after we know a call was actually rewritten.
const injectInvokeActivityImport = ( ast, localIdentifier ) => {
  ast.program.body.unshift( importDeclaration( [
    importSpecifier( localIdentifier, identifier( '__invokeActivity' ) )
  ], stringLiteral( '@outputai/core/invoker' ) ) );
};

// Build the generated dispatcher call, preserving the original call arguments.
const createInvokeActivityCall = ( invokeActivityId, activityName, args ) =>
  callExpression( identifier( invokeActivityId.name ), [ stringLiteral( activityName ), ...args ] );

// Rewrite valid function-body activity calls; top-level call validation belongs to the validator loader.
const rewriteActivityCalls = ( { ast, activityNames, invokeActivityId } ) => {
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

      path.replaceWith( createInvokeActivityCall( invokeActivityId, activityName, path.node.arguments ) );
      state.rewrote = true;
    }
  } );

  return state.rewrote;
};

// Reuse an existing framework import so repeated loader passes do not add duplicate imports.
const getExistingInvokeActivityLocal = ast => {
  for ( const node of ast.program.body ) {
    if ( node.type !== 'ImportDeclaration' || node.source.value !== '@outputai/core/invoker' ) {
      continue;
    }
    const spec = node.specifiers.find( s =>
      s.type === 'ImportSpecifier' &&
      s.imported.type === 'Identifier' &&
      s.imported.name === '__invokeActivity'
    );
    if ( spec ) {
      return spec.local;
    }
  }
  return null;
};

// Entry point: resolve collected component imports into plain dispatcher calls.
export default function rewriteFnBodies( { ast, activityImports } ) {
  const activityNames = buildActivityNameMap( activityImports );
  if ( activityNames.size === 0 ) {
    return false;
  }

  const existingLocal = getExistingInvokeActivityLocal( ast );
  const invokeActivityId = existingLocal ?? generateInvokeActivityIdentifier( ast );
  const rewrote = rewriteActivityCalls( { ast, activityNames, invokeActivityId } );
  if ( !rewrote ) {
    return false;
  }

  if ( !existingLocal ) {
    injectInvokeActivityImport( ast, invokeActivityId );
  }

  return rewrote;
};
