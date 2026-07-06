import { Worker } from '@temporalio/worker';

const resourceTargets = {
  targetMemoryUsage: 0.8,
  targetCpuUsage: 0.9
};

export const resourceBasedTuner = {
  tunerOptions: resourceTargets,
  workflowTaskSlotOptions: {
    minimumSlots: 2,
    maximumSlots: 1000,
    rampThrottle: '10ms'
  },
  activityTaskSlotOptions: {
    minimumSlots: 1,
    maximumSlots: 2000,
    rampThrottle: '50ms'
  },
  localActivityTaskSlotOptions: {
    minimumSlots: 1,
    maximumSlots: 2000,
    rampThrottle: '50ms'
  },
  nexusTaskSlotOptions: {
    minimumSlots: 1,
    maximumSlots: 2000,
    rampThrottle: '50ms'
  }
};

export const mixedSlotSupplierTuner = {
  workflowTaskSlotSupplier: {
    type: 'fixed-size',
    numSlots: 10
  },
  activityTaskSlotSupplier: {
    type: 'resource-based',
    tunerOptions: resourceTargets,
    minimumSlots: 1,
    maximumSlots: 2000,
    rampThrottle: '50ms'
  },
  localActivityTaskSlotSupplier: {
    type: 'resource-based',
    tunerOptions: resourceTargets,
    minimumSlots: 1,
    maximumSlots: 2000,
    rampThrottle: '50ms'
  },
  nexusTaskSlotSupplier: {
    type: 'fixed-size',
    numSlots: 10
  }
};

export const fixedSizeSlotSupplier = {
  type: 'fixed-size',
  numSlots: 20
};

export const resourceBasedSlotSupplier = {
  type: 'resource-based',
  tunerOptions: resourceTargets,
  minimumSlots: 1,
  maximumSlots: 2000,
  rampThrottle: '50ms'
};

export const customSlotSupplier = {
  type: 'custom',
  async reserveSlot( ctx, abortSignal ) {
    abortSignal.throwIfAborted();

    return {
      slotType: ctx.slotType,
      reservedAt: Date.now()
    };
  },
  tryReserveSlot( ctx ) {
    return { slotType: ctx.slotType, reservedAt: Date.now() };
  },
  markSlotUsed( ctx ) {
    void ctx;
  },
  releaseSlot( ctx ) {
    void ctx;
  }
};

export const customSlotSupplierTuner = {
  workflowTaskSlotSupplier: customSlotSupplier,
  activityTaskSlotSupplier: customSlotSupplier,
  localActivityTaskSlotSupplier: customSlotSupplier,
  nexusTaskSlotSupplier: fixedSizeSlotSupplier
};

export async function createWorkerWithTuner( baseWorkerOptions ) {
  return Worker.create( {
    ...baseWorkerOptions,
    tuner: resourceBasedTuner
  } );
}
