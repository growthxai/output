import { stepEventBus } from '#bus';

export const Event = {
  emit: ( eventName, payload ) => stepEventBus.emit( `sdk:${eventName}`, payload )
};
