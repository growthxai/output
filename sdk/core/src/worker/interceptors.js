import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { ActivityExecutionInterceptor } from './interceptors/activity.js';

const __dirname = dirname( fileURLToPath( import.meta.url ) );

export const initInterceptors = ( { activities, workflows } ) => ( {
  workflowModules: [ join( __dirname, './interceptors/workflow.js' ) ],
  activityInbound: [ () => new ActivityExecutionInterceptor( { activities, workflows } ) ]
} );
