import { ActivityExecutionInterceptor } from './activity.js';
import { workflowInterceptorModules } from './modules.js';

export const initInterceptors = ( { activities, workflows, connection } ) => ( {
  workflowModules: workflowInterceptorModules,
  activity: [
    () => ( {
      inbound: new ActivityExecutionInterceptor( { activities, workflows, connection } )
    } )
  ]
} );
