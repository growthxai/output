import { z } from 'zod';

const runIdSchema = z.string().uuid();
const bodySchema = z.object( { reason: z.string().optional() } ).optional().default( {} );

export function createTerminateHandler( client ) {
  return async ( req, res ) => {
    const { reason } = bodySchema.parse( req.body );
    const runId = req.params.rid ? runIdSchema.parse( req.params.rid ) : undefined;
    const info = await client.terminateWorkflow( req.params.id, reason, runId );
    res.json( { terminated: true, ...info } );
  };
}
