import child from './child/workflow.js';

export const invokeChild = async () => {
  const result = await child();
  return result;
};
