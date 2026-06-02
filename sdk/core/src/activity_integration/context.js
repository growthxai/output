import { Storage } from '#async_storage';

/**
 * Returns information trapped on AsyncStorage about the workflow invoking an activity
 *
 * @returns {object}
 */
export const getExecutionContext = () => {
  const ctx = Storage.load();
  if ( !ctx ) {
    return null;
  }

  return {
    workflowFilename: ctx.workflowFilename,
    activityInfo: ctx.activityInfo
  };
};
