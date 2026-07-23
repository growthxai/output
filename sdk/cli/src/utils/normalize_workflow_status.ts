/**
 * Normalizes statuses from earlier API contracts.
 *
 * This can be removed after Aug, 2026
 *
 * @param status - Workflow status from the API
 * @returns Normalized workflow status
 */
export const normalizeWorkflowStatus = <T extends string | null | undefined>(
  status: T
): T | 'continued_as_new' | 'cancelled' => {
  if ( status === 'continued' ) {
    return 'continued_as_new';
  }
  if ( status === 'canceled' ) {
    return 'cancelled';
  }
  return status;
};
