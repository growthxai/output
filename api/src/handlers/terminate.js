import { z } from 'zod';
import { readPinnedRunId } from './utils.js';

const bodySchema = z.object( { reason: z.string().optional() } ).optional().default( {} );

export function createTerminateHandler( client ) {
  return async ( req, res ) => {
    const { reason } = bodySchema.parse( req.body );
    const info = await client.terminateWorkflow( req.params.id, reason, readPinnedRunId( req ) );
    res.json( { terminated: true, ...info } );
  };
}
