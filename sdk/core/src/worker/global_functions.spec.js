import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  ACTIVITY_LOGGER_SYMBOL,
  BusEventType
} = vi.hoisted( () => ( {
  ACTIVITY_LOGGER_SYMBOL: Symbol( 'activity_logger' ),
  BusEventType: {
    ACTIVITY_LOG: 'activity:log'
  }
} ) );

const mainEventBusMock = vi.hoisted( () => ( {
  emit: vi.fn()
} ) );
const activityInfoMock = vi.hoisted( () => vi.fn( () => ( {
  activityId: 'act-1',
  activityType: 'myStep'
} ) ) );

vi.mock( '#consts', () => ( { ACTIVITY_LOGGER_SYMBOL, BusEventType } ) );
vi.mock( '#bus', () => ( { mainEventBus: mainEventBusMock } ) );
vi.mock( '@temporalio/activity', () => ( {
  activityInfo: activityInfoMock
} ) );

describe( 'worker/global_functions', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    delete globalThis[ACTIVITY_LOGGER_SYMBOL];
  } );

  it( 'binds activity logger global function that emits activity log events with metadata', async () => {
    const { bindGlobalFunctions } = await import( './global_functions.js' );
    const metadata = { requestId: 'req-1' };

    bindGlobalFunctions();
    globalThis[ACTIVITY_LOGGER_SYMBOL]( {
      level: 'debug',
      message: 'activity detail',
      metadata
    } );

    expect( activityInfoMock ).toHaveBeenCalledTimes( 1 );
    expect( mainEventBusMock.emit ).toHaveBeenCalledWith( BusEventType.ACTIVITY_LOG, {
      level: 'debug',
      message: 'activity detail',
      metadata,
      activityInfo: {
        activityId: 'act-1',
        activityType: 'myStep'
      }
    } );
  } );
} );
