import { FatalError } from '#errors';

/**
 * Returns a copy of activity options with framework-required policies enforced.
 * @param {object} activityOptions
 * @returns {object}
 */
export const enforceActivityOptions = activityOptions => {
  const options = activityOptions ?? {};
  const retry = options.retry ?? {};
  const nonRetryableErrorTypes = retry.nonRetryableErrorTypes ?? [];
  return {
    ...options,
    retry: {
      ...retry,
      nonRetryableErrorTypes: [
        ...new Set( nonRetryableErrorTypes.concat( FatalError.name ) )
      ]
    }
  };
};
