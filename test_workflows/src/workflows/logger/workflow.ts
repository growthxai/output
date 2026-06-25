import { workflow, z, Logger } from '@outputai/core';
import { getWord } from './steps.js';

export default workflow( {
  name: 'logger',
  description: 'A workflow to demonstrate logger',
  outputSchema: z.object( {
    word: z.string()
  } ),
  fn: async () => {
    const word = await getWord();
    Logger.error( 'generate word', { word } );
    Logger.warn( 'generate word', { word } );
    Logger.info( 'generate word', { word } );
    Logger.http( 'generate word', { word } );
    Logger.verbose( 'generate word', { word } );
    Logger.debug( 'generate word', { word } );
    Logger.silly( 'generate word', { word } );
    Logger.info( 'drop a reserved word', { message: 'foo' } );
    return { word };
  }
} );
