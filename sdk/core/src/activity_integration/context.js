import { Storage } from '#async_storage';

/**
 * Returns information trapped on AsyncStorage about the workflow invoking an activity
 *
 * @returns {object}
 */
export const getExecutionContext = () => {
  const ctx = Storage.load();

  if ( !ctx?.executionContext || !ctx?.workflowFilename ) {
    return null;
  }

  const { workflowId: id, workflowName: name } = ctx.executionContext;
  return { workflow: { id, name, filename: ctx.workflowFilename } };
};
