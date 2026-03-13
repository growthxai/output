import { workflow, z, executeInParallel } from '@outputai/core';
import { sumValues } from './steps.js';

export default workflow( {
  name: 'execute_in_parallel',
  description: 'Execute in parallel test',
  outputSchema: z.object( {
    results: z.array( z.number() )
  } ),
  fn: async () => {
    const results = await executeInParallel( {
      jobs: [
        () => sumValues( [ 1, 1, 1 ] ),
        () => sumValues( [ 2, 2, 2 ] ),
        () => sumValues( [ 3, 3, 3 ] )
      ],
      concurrency: 1
    } );
    return { results: results.filter( r => r.ok ).map( r => r.result ) };
  }
} );
