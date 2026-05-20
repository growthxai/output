import { randomUUID } from 'node:crypto';
import { messageBus } from '#bus';
import { Storage } from '#async_storage';

export const emitEvent = ( eventName, payload ) => {
  const ctx = Storage.load();

  const { executionContext, parentId: activityId } = ctx ?? {};
  const { workflowId, runId } = executionContext ?? {};
  messageBus.emit( `external:${eventName}`, {
    eventId: randomUUID(),
    ...payload ?? {},
    workflowId, runId, activityId
  } );
};
