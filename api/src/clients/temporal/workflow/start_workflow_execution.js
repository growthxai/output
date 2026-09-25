import { isGrpcServiceError } from '@temporalio/client';
import { logger } from '#logger';
import { GrpcStatus } from '../types.js';
import { buildSearchAttributes } from './build_search_attributes.js';

const UNMAPPED_SEARCH_ATTRIBUTE = /has no mapping defined for search attribute/;

/** Walks the error's cause chain so a wrapped ServiceError still matches, same as error_handler.js. */
const isUnmappedSearchAttributeError = err => Boolean( err ) && (
  ( isGrpcServiceError( err ) && err.code === GrpcStatus.INVALID_ARGUMENT && UNMAPPED_SEARCH_ATTRIBUTE.test( err.details ?? '' ) ) ||
  isUnmappedSearchAttributeError( err.cause )
);

/**
 * Starts a workflow execution, attaching searchAttributes derived from `input` when present.
 *
 * Falls back to starting without them if Temporal rejects the request because the referenced
 * search attribute isn't registered on the namespace (see docs/guides/operations/deployment.mdx),
 * so a missing one-time `temporal operator search-attribute create` step degrades search instead
 * of blocking every dispatch that carries a workspaceId.
 *
 * @param {object} client - Temporal client
 * @param {string} resolvedName - Resolved workflow type name
 * @param {any} input - Workflow input (source of searchAttributes)
 * @param {object} startOptions - Remaining `client.workflow.start` options (args, taskQueue, workflowId, ...)
 * @returns {Promise<object>} The Temporal workflow handle
 */
export const startWorkflowExecution = async ( client, resolvedName, input, startOptions ) => {
  const searchAttributes = buildSearchAttributes( input );
  if ( Object.keys( searchAttributes ).length === 0 ) {
    return client.workflow.start( resolvedName, startOptions );
  }

  try {
    return await client.workflow.start( resolvedName, { ...startOptions, ...searchAttributes } );
  } catch ( error ) {
    if ( !isUnmappedSearchAttributeError( error ) ) {
      throw error;
    }
    logger.warn(
      'Temporal search attribute not registered on namespace; starting workflow without it. ' +
      'Run: temporal operator search-attribute create --name WorkspaceId --type Keyword',
      { workflowName: resolvedName, errorMessage: error.cause?.details ?? error.message }
    );
    return client.workflow.start( resolvedName, startOptions );
  }
};
