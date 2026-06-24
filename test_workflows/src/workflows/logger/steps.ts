import { step, Logger, z } from '@outputai/core';

const words = [ 'car', 'race', 'wheel', 'engine' ];

export const getWord = step( {
  name: 'getWord',
  description: 'Generate a word',
  outputSchema: z.string(),
  fn: async () => {
    const date = Date.now();
    Logger.error( 'Generating a word based on the current date', { date } );
    Logger.warn( 'Generating a word based on the current date', { date } );
    Logger.info( 'Generating a word based on the current date', { date } );
    Logger.http( 'Generating a word based on the current date', { date } );
    Logger.verbose( 'Generating a word based on the current date', { date } );
    Logger.debug( 'Generating a word based on the current date', { date } );
    Logger.silly( 'Generating a word based on the current date', { date } );
    Logger.info( 'drop a reserved word', { message: 'foo' } );
    const index = Math.floor( date % words.length );

    return words[index];
  },
  options: {
    activityOptions: {
      retry: {
        initialInterval: '5s'
      }
    }
  }
} );
