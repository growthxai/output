import self from './workflow.js';

export const invokeChild = async ( currentDepth: number ) => {
  await self( { currentDepth } );
};
