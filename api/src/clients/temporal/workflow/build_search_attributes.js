/**
 * Builds Temporal searchAttributes start-options, if the input carries a workspaceId.
 *
 * @param {any} input - The workflow input
 * @returns {{ searchAttributes?: { WorkspaceId: string[] } }} Spreadable partial start-options object
 */
export const buildSearchAttributes = input => {
  const workspaceId = input?.workspaceId;
  const isValid = typeof input === 'object' && input !== null && !Array.isArray( input ) &&
    typeof workspaceId === 'string' && workspaceId.length > 0;

  return isValid ? { searchAttributes: { WorkspaceId: [ workspaceId ] } } : {};
};
