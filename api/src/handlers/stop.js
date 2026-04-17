import { readPinnedRunId } from './utils.js';

export function createStopHandler( client ) {
  return async ( req, res ) => {
    res.json( await client.stopWorkflow( req.params.id, readPinnedRunId( req ) ) );
  };
}
