import { z } from 'zod';

export function createWorkflowHistoryHandler( client ) {
  const querySchema = z.object( {
    runId: z.string().optional(),
    pageSize: z.coerce.number().int().min( 1 ).max( 50 ).default( 20 ),
    pageToken: z.preprocess(
      v => v === '' ? undefined : v,
      z.string().regex( /^[A-Za-z0-9+/]+={0,2}$/, 'Invalid pageToken format' ).optional()
    ),
    includePayloads: z.union( [ z.literal( 'true' ), z.literal( 'false' ) ] ).default( 'false' ).transform( v => v === 'true' )
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
