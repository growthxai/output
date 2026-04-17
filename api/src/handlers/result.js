import { z } from 'zod';

const runIdSchema = z.string().uuid();

export function createResultHandler( client ) {
  return async ( req, res ) => {
    const runId = req.params.rid ? runIdSchema.parse( req.params.rid ) : undefined;
    res.json( await client.getWorkflowResult( req.params.id, runId ) );
  };
}
