import { z } from 'zod';

/**
 * Create workflow history handler with injected temporal client
 * @param {Object} client - Temporal client instance
 * @returns {Function} Express request handler
 */
export function createWorkflowHistoryHandler( client ) {
  const querySchema = z.object( {
    runId: z.string().optional(),
    pageSize: z.coerce.number().int().min( 1 ).max( 50 ).default( 20 ),
    pageToken: z.string().optional(),
    includePayloads: z.coerce.boolean().default( false )
  } ).refine(
    data => !data.pageToken || data.runId,
    { message: 'runId is required when using pageToken', path: [ 'runId' ] }
  );

  return async ( req, res, next ) => {
    try {
      const workflowId = req.params.id;
      const { runId, pageSize, pageToken, includePayloads } = querySchema.parse( req.query );

      const result = await client.getWorkflowHistory( workflowId, {
        runId,
        pageSize,
        pageToken,
        includePayloads
      } );

      res.json( result );
    } catch ( error ) {
      next( error );
    }
  };
}
