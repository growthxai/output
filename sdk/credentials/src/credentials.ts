import { dirname } from 'node:path';
import { MissingCredentialError } from './errors.js';
import { getExecutionContext } from '@outputai/core/sdk_activity_integration';
import { deepMerge } from '@outputai/core/sdk_utils';
import { getProvider } from './provider_registry.js';

const getNestedValue = ( obj: Record<string, unknown>, dotPath: string ): unknown =>
  dotPath.split( '.' ).reduce( ( acc: unknown, part: string ) =>
    ( acc as Record<string, unknown> )?.[part], obj );

const detectEnvironment = (): string | undefined => {
  const env = process.env.NODE_ENV;
  return ( env === 'production' || env === 'development' ) ? env : undefined;
};

const GLOBAL_CACHE_KEY = Symbol( 'global' );
const cache = new Map<string | symbol, Record<string, unknown>>();

const loadGlobal = (): Record<string, unknown> => {
  if ( cache.has( GLOBAL_CACHE_KEY ) ) {
    return cache.get( GLOBAL_CACHE_KEY )!;
  }

  const data = getProvider().loadGlobal( { environment: detectEnvironment() } );
  cache.set( GLOBAL_CACHE_KEY, data );
  return data;
};

const loadForWorkflow = ( workflowName: string, workflowDir: string | undefined ): Record<string, unknown> => {
  if ( cache.has( workflowName ) ) {
    return cache.get( workflowName )!;
  }

  const globalData = loadGlobal();
  const workflowData = getProvider().loadForWorkflow( {
    workflowName,
    workflowDir,
    environment: detectEnvironment()
  } );
  const merged = workflowData ? deepMerge( globalData, workflowData ) as Record<string, unknown> : globalData;
  cache.set( workflowName, merged );
  return merged;
};

const getWorkflowContext = () => {
  const ctx = getExecutionContext();
  if ( !ctx ) {
    return { workflowName: undefined, workflowDir: undefined };
  }
  return {
    workflowName: ctx.workflow.name,
    workflowDir: dirname( ctx.workflow.filename )
  };
};

const load = (): Record<string, unknown> => {
  const { workflowName, workflowDir } = getWorkflowContext();

  if ( !workflowName ) {
    return loadGlobal();
  }

  return loadForWorkflow( workflowName, workflowDir );
};

export const credentials = {
  get: ( path: string, defaultValue: unknown = undefined ): unknown => {
    const data = load();
    const value = getNestedValue( data, path );
    return value !== undefined ? value : defaultValue;
  },

  require: ( path: string ): unknown => {
    const value = credentials.get( path );

    if ( value === undefined || value === null ) {
      throw new MissingCredentialError( path );
    }

    return value;
  },

  _reset: (): void => {
    cache.clear();
  }
};
