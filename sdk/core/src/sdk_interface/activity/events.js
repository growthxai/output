import { messageBus } from '#bus';
import { Storage } from '#async_storage';

export const emit = ( eventName, payload ) => {
  const ctx = Storage.load();

  messageBus.emit( `external:${eventName}`, {
    ...payload ?? {},
    ...( ctx && {
      activityInfo: ctx.activityInfo,
      workflowDetails: ctx.workflowDetails,
      outputActivityKind: ctx.outputActivityKind
    } )
  } );
};
