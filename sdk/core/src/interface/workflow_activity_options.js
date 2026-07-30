export const defaultOptions = {
  activityOptions: {
    startToCloseTimeout: '20m',
    heartbeatTimeout: '5m',
    retry: {
      initialInterval: '10s',
      backoffCoefficient: 2.0,
      maximumInterval: '2m',
      maximumAttempts: 3,
      nonRetryableErrorTypes: []
    }
  },
  disableTrace: false
};
