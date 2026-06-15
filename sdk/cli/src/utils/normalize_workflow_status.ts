/**
 * Temporary compatibility for API responses produced before CONTINUED_AS_NEW
 * was exposed as `continued_as_new`.
 *
 * @param status - Workflow status from the API
 * @returns Normalized workflow status
 */
export const normalizeWorkflowStatus = <T extends string | null | undefined>( status: T ): T | 'continued_as_new' =>
  status === 'continued' ? 'continued_as_new' : status;
