import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { ActivityExecutionInterceptor } from './activity.js';

const __dirname = dirname( fileURLToPath( import.meta.url ) );

export const initInterceptors = ( { activities, workflows } ) => ( {
  workflowModules: [ join( __dirname, './workflow.js' ) ],
  activity: [
    () => ( {
      inbound: new ActivityExecutionInterceptor( { activities, workflows } )
    } )
  ]
} );
