import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.hoisted( () => ( { workerTelemetryIntervalMs: 0 } ) );
const logMock = vi.hoisted( () => ( { info: vi.fn(), warn: vi.fn() } ) );
const createChildLoggerMock = vi.hoisted( () => vi.fn( () => logMock ) );

vi.mock( './configs.js', () => ( {
  get workerTelemetryIntervalMs() {
    return configMock.workerTelemetryIntervalMs;
  }
} ) );

vi.mock( '#logger', () => ( { createChildLogger: createChildLoggerMock } ) );

const loadSetupTelemetry = async () => {
  vi.resetModules();
  return import( './telemetry.js' );
};

const mockSetInterval = unrefMock =>
  vi.spyOn( globalThis, 'setInterval' ).mockReturnValue( { unref: unrefMock } );

describe( 'worker/telemetry', () => {
  const availableMemoryMock = vi.fn();
  const constrainedMemoryMock = vi.fn();
  const memoryUsageMock = vi.fn();
  const unrefMock = vi.fn();

  beforeEach( () => {
    vi.clearAllMocks();
    configMock.workerTelemetryIntervalMs = 0;

    availableMemoryMock.mockReturnValue( 1_000 );
    constrainedMemoryMock.mockReturnValue( 2_000 );
    memoryUsageMock.mockReturnValue( { heapUsed: 300 } );

    vi.spyOn( process, 'availableMemory' ).mockImplementation( availableMemoryMock );
    vi.spyOn( process, 'constrainedMemory' ).mockImplementation( constrainedMemoryMock );
    vi.spyOn( process, 'memoryUsage' ).mockImplementation( memoryUsageMock );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'does not create an interval when telemetry interval is disabled', async () => {
    const setIntervalMock = mockSetInterval( unrefMock );
    const { setupTelemetry } = await loadSetupTelemetry();

    setupTelemetry( { worker: { getStatus: vi.fn() } } );

    expect( setIntervalMock ).not.toHaveBeenCalled();
    expect( logMock.info ).not.toHaveBeenCalled();
  } );

  it( 'logs worker status and memory on the configured interval', async () => {
    const setIntervalMock = mockSetInterval( unrefMock );
    configMock.workerTelemetryIntervalMs = 5_000;
    const worker = { getStatus: vi.fn().mockReturnValue( { runState: 'RUNNING' } ) };
    const { setupTelemetry } = await loadSetupTelemetry();

    setupTelemetry( { worker } );

    expect( createChildLoggerMock ).toHaveBeenCalledWith( 'Telemetry' );
    expect( setIntervalMock ).toHaveBeenCalledWith( expect.any( Function ), 5_000 );
    expect( unrefMock ).toHaveBeenCalled();

    const [ callback ] = setIntervalMock.mock.calls[0];
    callback();

    expect( logMock.info ).toHaveBeenCalledWith( 'Worker', {
      status: { runState: 'RUNNING' },
      memory: {
        availableMemory: 1_000,
        constrainedMemory: 2_000,
        memoryUsage: { heapUsed: 300 }
      }
    } );
  } );
} );
