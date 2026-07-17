import httpSimple from '../../../http/http_simple/workflow.js';

export const invokeChild = async () => {
  const result = await httpSimple();
  return result;
};
