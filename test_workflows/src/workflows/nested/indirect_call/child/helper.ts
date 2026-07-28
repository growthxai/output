import httpSimple from '../../../http/simple/workflow.js';

export const invokeChild = async () => {
  const result = await httpSimple();
  return result;
};
