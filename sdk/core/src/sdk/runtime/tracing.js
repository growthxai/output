import { addEventActionWithContext as send, EventAction } from '#tracing';

import { Attribute } from '#trace_attribute';

export const Tracing = {
  Attribute,
  addEventStart: ( { id, kind, name, details } ) => send( EventAction.START, { kind, name, details, id } ),
  addEventEnd: ( { id, details } ) => send( EventAction.END, { id, details } ),
  addEventError: ( { id, details } ) => send( EventAction.ERROR, { id, details } ),
  addEventAttribute: ( { eventId, attribute } ) => send( EventAction.ADD_ATTR, { id: eventId, details: attribute } )
};
