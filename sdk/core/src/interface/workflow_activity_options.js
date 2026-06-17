import { FatalError, ValidationError } from '#errors';

export const defaultOptions = {
  activityOptions: {
    startToCloseTimeout: '20m',
    heartbeatTimeout: '5m',
    retry: {
      initialInterval: '10s',
      backoffCoefficient: 2.0,
      maximumInterval: '2m',
      maximumAttempts: 3,
      nonRetryableErrorTypes: [ ValidationError.name, FatalError.name ]
    }
  },
  disableTrace: false
};
