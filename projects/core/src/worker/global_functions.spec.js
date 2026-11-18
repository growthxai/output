import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const {
  WORKER_LOGGER_SYMBOL,
  BusEventType
} = vi.hoisted( () => ( {
  WORKER_LOGGER_SYMBOL: Symbol( 'worker_logger' ),
  BusEventType: {
    ACTIVITY_LOG: 'activity:log',
    WORKER_LOG: 'worker:log'
  }
} ) );

const mainEventBusMock = vi.hoisted( () => ( {
  emit: vi.fn()
} ) );
const activityInfoMock = vi.hoisted( () => vi.fn( () => ( {
  activityId: 'act-1',
  activityType: 'myStep'
} ) ) );
const asyncLocalStorageMock = vi.hoisted( () => ( {
  getStore: vi.fn()
} ) );

vi.mock( '#consts', () => ( { WORKER_LOGGER_SYMBOL, BusEventType } ) );
vi.mock( '#bus', () => ( { mainEventBus: mainEventBusMock } ) );
vi.mock( '@temporalio/activity', () => ( {
  activityInfo: activityInfoMock,
  asyncLocalStorage: asyncLocalStorageMock
} ) );

describe( 'worker/global_functions', () => {
  beforeAll( async () => {
    const { bindGlobalFunctions } = await import( './global_functions.js' );
    bindGlobalFunctions();
  } );

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'emits ACTIVITY_LOG with activityInfo when an activity context exists', () => {
    const metadata = { requestId: 'req-1' };
    asyncLocalStorageMock.getStore.mockReturnValue( {} );

    globalThis[WORKER_LOGGER_SYMBOL]( {
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

  it( 'emits WORKER_LOG without activityInfo when no activity context exists', () => {
    const metadata = { requestId: 'req-2' };
    asyncLocalStorageMock.getStore.mockReturnValue( undefined );

    globalThis[WORKER_LOGGER_SYMBOL]( {
      level: 'warn',
      message: 'hook detail',
      metadata
    } );

    expect( activityInfoMock ).not.toHaveBeenCalled();
    expect( mainEventBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKER_LOG, {
      level: 'warn',
      message: 'hook detail',
      metadata
    } );
  } );
} );
