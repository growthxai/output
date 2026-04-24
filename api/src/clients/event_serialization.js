import { defaultPayloadConverter } from '@temporalio/client';
import { logger } from '#logger';
import { EventTypeName } from './event_types.js';

const warnedUnknownEventTypes = new Set();

export const serializeEventTime = eventTime => {
  if ( !eventTime?.seconds ) {
    return null;
  }
  return new Date( ( +eventTime.seconds * 1000 ) + Math.floor( eventTime.nanos / 1e6 ) ).toISOString();
};

const decodePayload = ( p, eventId ) => {
  try {
    return defaultPayloadConverter.fromPayload( p );
  } catch ( error ) {
    const encoding = p?.metadata?.encoding ?
      Buffer.from( p.metadata.encoding ).toString() :
      'unknown';
    logger.warn( 'Failed to decode event payload', {
      eventId: eventId?.toString(),
      encoding,
      error: error.message
    } );
    return { _raw: true, encoding };
  }
};

const PAYLOAD_FIELDS = {
  workflowExecutionStartedEventAttributes: [ 'input' ],
  workflowExecutionCompletedEventAttributes: [ 'result' ],
  activityTaskScheduledEventAttributes: [ 'input' ],
  activityTaskCompletedEventAttributes: [ 'result' ],
  activityTaskFailedEventAttributes: [ 'failure' ]
};

// Non-JSON payloads produce a { _raw: true, encoding } fallback instead of throwing.
export const decodeEventPayloads = event => {
  for ( const [ attrKey, fields ] of Object.entries( PAYLOAD_FIELDS ) ) {
    const attrs = event[attrKey];
    if ( !attrs ) {
      continue;
    }

    const decoded = { ...attrs };
    for ( const field of fields ) {
      if ( field === 'failure' ) {
        // failure is a Failure proto, not a Payloads wrapper -- extract message/stackTrace
        if ( attrs.failure ) {
          decoded.failure = {
            message: attrs.failure.message ?? null,
            stackTrace: attrs.failure.stackTrace ?? null,
            type: attrs.failure.failureInfo?.applicationFailureInfo?.type ?? null
          };
        }
        continue;
      }
      const payloads = attrs[field]?.payloads;
      if ( !payloads?.length ) {
        continue;
      }
      decoded[field] = payloads.map( p => decodePayload( p, event.eventId ) );
    }
    return { ...event, [attrKey]: decoded };
  }
  return event;
};

export const serializeEvent = ( event, { includePayloads = false } = {} ) => {
  const eventType = typeof event.eventType === 'object' ?
    Number( event.eventType.toString() ) :
    event.eventType;

  if ( EventTypeName[eventType] === undefined && !warnedUnknownEventTypes.has( eventType ) ) {
    logger.warn( 'Unknown Temporal event type encountered', { eventType } );
    warnedUnknownEventTypes.add( eventType );
  }

  const serialized = {
    eventId: event.eventId?.toString() ?? null,
    eventType,
    eventTypeName: EventTypeName[eventType] ?? `UNKNOWN_${eventType}`,
    eventTime: serializeEventTime( event.eventTime )
  };

  const attrKey = Object.keys( event ).find( k => k.endsWith( 'EventAttributes' ) );
  if ( !attrKey || !event[attrKey] ) {
    return serialized;
  }

  // Forward-compat: for unknown event types, drop attrs when payloads aren't requested
  // to avoid leaking undefined payload-bearing fields on new Temporal enum values.
  if ( !includePayloads && EventTypeName[eventType] === undefined ) {
    return serialized;
  }

  const attrs = { ...event[attrKey] };

  if ( attrs.scheduledEventId ) {
    attrs.scheduledEventId = attrs.scheduledEventId.toString();
  }
  if ( attrs.startedEventId ) {
    attrs.startedEventId = attrs.startedEventId.toString();
  }

  // activityType.name uses the "workflow-name#stepName" convention; fall back to full name otherwise
  if ( attrs.activityType?.name ) {
    const name = attrs.activityType.name;
    attrs.stepName = name.includes( '#' ) ? name.split( '#' ).pop() : name;
  }

  if ( !includePayloads ) {
    delete attrs.input;
    delete attrs.result;
    delete attrs.failure;
    delete attrs.details;
    delete attrs.lastCompletionResult;
    delete attrs.lastFailure;
  }

  serialized[attrKey] = attrs;
  return serialized;
};
