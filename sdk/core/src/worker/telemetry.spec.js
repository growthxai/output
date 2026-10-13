import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configMock = vi.hoisted( () => ( { workerTelemetryIntervalMs: 0 } ) );
const logMock = vi.hoisted( () => ( { info: vi.fn(), warn: vi.fn() } ) );
const createChildLoggerMock = vi.hoisted( () => vi.fn( () => logMock ) );
const getHeapStatisticsMock = vi.hoisted( () => vi.fn( () => ( { heap_size_limit: 4_000 } ) ) );
const totalmemMock = vi.hoisted( () => vi.fn( () => 10_000 ) );

vi.mock( 'node:v8', () => ( { getHeapStatistics: getHeapStatisticsMock } ) );
vi.mock( 'node:os', () => ( { totalmem: totalmemMock } ) );

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
    memoryUsageMock.mockReturnValue( { rss: 1_200, heapUsed: 300 } );

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
        memoryLimit: 2_000,
        memoryUsage: { rss: 1_200, heapUsed: 300 },
        nonMainHeap: 900,
        heapSizeLimit: 4_000
      }
    } );
  } );

  describe( 'logIsolateSizing', () => {
    const createWorker = ( options = {} ) => ( {
      options: {
        workflowThreadPoolSize: 1,
        reuseV8Context: true,
        debugMode: false,
        maxCachedWorkflows: 100,
        tuner: { workflowTaskSlotSupplier: { type: 'fixed-size', numSlots: 40 } },
        ...options
      }
    } );

    it( 'logs the resolved sizing when it fits the memory limit', async () => {
      constrainedMemoryMock.mockReturnValue( 9_000 );
      const { logIsolateSizing } = await loadSetupTelemetry();

      logIsolateSizing( { worker: createWorker() } );

      expect( logMock.warn ).not.toHaveBeenCalled();
      expect( logMock.info ).toHaveBeenCalledWith( 'Worker isolates', {
        workflowThreadPoolSize: 1,
        reuseV8Context: true,
        isolateCount: 2,
        heapSizeLimit: 4_000,
        projectedCommittedHeap: 8_000,
        memoryLimit: 9_000,
        maxCachedWorkflows: 100,
        workflowTaskSlots: 40
      } );
    } );

    it( 'warns when the isolates may commit more heap than the memory limit', async () => {
      const { logIsolateSizing } = await loadSetupTelemetry();

      logIsolateSizing( { worker: createWorker() } );

      expect( logMock.info ).not.toHaveBeenCalled();
      expect( logMock.warn ).toHaveBeenCalledWith(
        'Worker isolates may commit more heap than the host allows',
        expect.objectContaining( { projectedCommittedHeap: 8_000, memoryLimit: 2_000 } )
      );
    } );

    it( 'falls back to the machine memory when constrainedMemory reports the unconstrained sentinel', async () => {
      constrainedMemoryMock.mockReturnValue( 2 ** 64 );
      const { logIsolateSizing } = await loadSetupTelemetry();

      logIsolateSizing( { worker: createWorker() } );

      expect( logMock.info ).toHaveBeenCalledWith( 'Worker isolates', expect.objectContaining( { memoryLimit: 10_000 } ) );
    } );

    it( 'counts only the main isolate under debugMode', async () => {
      constrainedMemoryMock.mockReturnValue( 5_000 );
      const { logIsolateSizing } = await loadSetupTelemetry();

      logIsolateSizing( { worker: createWorker( { debugMode: true } ) } );

      expect( logMock.warn ).not.toHaveBeenCalled();
      expect( logMock.info ).toHaveBeenCalledWith(
        'Worker isolates',
        expect.objectContaining( { isolateCount: 1, projectedCommittedHeap: 4_000 } )
      );
    } );

    it( 'warns when there are more workflow task slots than cached workflows', async () => {
      constrainedMemoryMock.mockReturnValue( 9_000 );
      const { logIsolateSizing } = await loadSetupTelemetry();

      logIsolateSizing( { worker: createWorker( { maxCachedWorkflows: 10 } ) } );

      expect( logMock.info ).not.toHaveBeenCalled();
      expect( logMock.warn ).toHaveBeenCalledWith(
        'Worker runs more workflow tasks than it can cache, forcing replays',
        expect.objectContaining( { maxCachedWorkflows: 10, workflowTaskSlots: 40 } )
      );
    } );
  } );
} );
