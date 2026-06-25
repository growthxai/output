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
    Logger.info( 'Inline namespace overwrite', { namespace: 'Inline namespace' } );
    const l = Logger.createLogger( 'Namespace overwrite' );
    l.error( 'Generating a word based on the current date', { date } );
    l.warn( 'Generating a word based on the current date', { date } );
    l.info( 'Generating a word based on the current date', { date } );
    l.http( 'Generating a word based on the current date', { date } );
    l.verbose( 'Generating a word based on the current date', { date } );
    l.debug( 'Generating a word based on the current date', { date } );
    l.silly( 'Generating a word based on the current date', { date } );
    l.info( 'Inline namespace overwrite', { namespace: 'Inline namespace' } );
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
