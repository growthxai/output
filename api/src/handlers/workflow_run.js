import { z } from 'zod';
import { readPinnedRunId } from './utils.js';

const terminateBodySchema = z.object( { reason: z.string().optional() } ).optional().default( {} );

export function createStopHandler( client ) {
  return async ( req, res ) => {
    res.json( await client.stopWorkflow( req.params.id, readPinnedRunId( req ) ) );
  };
}

export function createTerminateHandler( client ) {
  return async ( req, res ) => {
    const { reason } = terminateBodySchema.parse( req.body );
    const info = await client.terminateWorkflow( req.params.id, reason, readPinnedRunId( req ) );
    res.json( { terminated: true, ...info } );
  };
}

export function createResultHandler( client ) {
  return async ( req, res ) => {
    res.json( await client.getWorkflowResult( req.params.id, readPinnedRunId( req ) ) );
  };
}
