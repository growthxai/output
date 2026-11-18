import { z } from 'zod';

const runIdSchema = z.uuid();

/** Parse and return the pinned runId from `:rid`, or undefined for shortcut routes. */
export const readPinnedRunId = req => ( req.params.rid ? runIdSchema.parse( req.params.rid ) : undefined );
