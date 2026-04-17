import { readPinnedRunId } from './utils.js';

export function createResultHandler( client ) {
  return async ( req, res ) => {
    res.json( await client.getWorkflowResult( req.params.id, readPinnedRunId( req ) ) );
  };
}
