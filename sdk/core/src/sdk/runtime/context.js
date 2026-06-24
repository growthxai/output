import { Storage } from '#async_storage';

export const Context = {
  getActivityContext: () => {
    const ctx = Storage.load();
    if ( !ctx ) {
      return null;
    }

    return {
      workflowFilename: ctx.workflowFilename,
      activityInfo: ctx.activityInfo
    };
  }
};
