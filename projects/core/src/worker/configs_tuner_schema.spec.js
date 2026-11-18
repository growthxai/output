import { describe, expect, it } from 'vitest';
import { workerTunerEnvSchema } from './configs_tuner_schema.js';

const parseWorkerTuner = value => workerTunerEnvSchema.parse( value );

describe( 'worker/configs_tuner_schema', () => {
  it( 'treats empty string as unset', () => {
    expect( parseWorkerTuner( '' ) ).toBeUndefined();
  } );

  it( 'parses resource-based Temporal worker tuner JSON', () => {
    const workerTuner = {
      tunerOptions: {
        targetMemoryUsage: 0.8,
        targetCpuUsage: 0.9
      },
      activityTaskSlotOptions: {
        minimumSlots: 1,
        maximumSlots: 100,
        rampThrottle: '50ms'
      }
    };

    expect( parseWorkerTuner( JSON.stringify( workerTuner ) ) ).toEqual( workerTuner );
  } );

  it( 'parses per-task Temporal worker tuner JSON', () => {
    const resourceBasedSupplier = {
      type: 'resource-based',
      tunerOptions: {
        targetMemoryUsage: 0.8,
        targetCpuUsage: 0.9
      },
      minimumSlots: 1,
      maximumSlots: 100,
      rampThrottle: '50ms'
    };
    const workerTuner = {
      workflowTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      },
      activityTaskSlotSupplier: resourceBasedSupplier,
      localActivityTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      },
      nexusTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      }
    };

    expect( parseWorkerTuner( JSON.stringify( workerTuner ) ) ).toEqual( workerTuner );
  } );

  it( 'throws when tuner is not valid JSON', () => {
    expect( () => parseWorkerTuner( '{invalid' ) ).toThrow();
  } );

  it( 'throws when tuner is not a JSON object', () => {
    expect( () => parseWorkerTuner( '[]' ) ).toThrow();
  } );

  it( 'throws when tuner is missing required per-task suppliers', () => {
    const workerTuner = {
      workflowTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      },
      activityTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      }
    };

    expect( () => parseWorkerTuner( JSON.stringify( workerTuner ) ) ).toThrow();
  } );

  it( 'throws when tuner uses custom suppliers', () => {
    const workerTuner = {
      workflowTaskSlotSupplier: {
        type: 'custom'
      },
      activityTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      },
      localActivityTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      },
      nexusTaskSlotSupplier: {
        type: 'fixed-size',
        numSlots: 10
      }
    };

    expect( () => parseWorkerTuner( JSON.stringify( workerTuner ) ) ).toThrow();
  } );

  it( 'throws when target usage is outside range', () => {
    const workerTuner = {
      tunerOptions: {
        targetMemoryUsage: 1.5,
        targetCpuUsage: 0.9
      }
    };

    expect( () => parseWorkerTuner( JSON.stringify( workerTuner ) ) ).toThrow();
  } );

  it( 'throws when minimum slots exceeds maximum slots', () => {
    const workerTuner = {
      tunerOptions: {
        targetMemoryUsage: 0.8,
        targetCpuUsage: 0.9
      },
      activityTaskSlotOptions: {
        minimumSlots: 10,
        maximumSlots: 5
      }
    };

    expect( () => parseWorkerTuner( JSON.stringify( workerTuner ) ) ).toThrow();
  } );
} );
