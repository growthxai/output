import { ActivityExecutionInterceptor } from './activity.js';
import { workflowInterceptorModules } from './modules.js';

export { workflowInterceptorModules };

export const initInterceptors = ( { activities, workflows, connection } ) => ( {
  workflowModules: workflowInterceptorModules,
  activity: [
    () => ( {
      inbound: new ActivityExecutionInterceptor( { activities, workflows, connection } )
    } )
  ]
} );
