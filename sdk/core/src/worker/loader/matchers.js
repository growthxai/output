import { sep } from 'node:path';

/**
 * Creates a matcher function that based on "path", matches:
 * - path/steps.js
 * - path/evaluators.js
 * - path/steps/*
 * - path/evaluators/*
 * @param {string} path
 * @returns {function(string): boolean}
 */
export const buildActivityMatcher = path => {
  const exp = new RegExp( `^${RegExp.escape( `${path}${sep}` )}(?:steps|evaluators)(?:\\.js$|${RegExp.escape( sep )})` );
  return v => exp.test( v );
};

/**
 * Matchers that can be used to access conditions without initializing them
 */
export const staticMatchers = {
  /**
   * Matches a workflow.js file
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  workflowFile: v => v.endsWith( `${sep}workflow.js` ),
  /**
   * Matches a workflow.js that is inside a shared folder: eg foo/shared/workflow.js
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  workflowPathHasShared: v => v.endsWith( `${sep}shared${sep}workflow.js` ),
  /**
   * Matches the shared folder for steps src/shared/steps/../step_file.js
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  sharedStepsDir: v => v.includes( `${sep}shared${sep}steps${sep}` ) && v.endsWith( '.js' ),
  /**
   * Matches the shared folder for evaluators src/shared/evaluators/../evaluator_file.js
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  sharedEvaluatorsDir: v => v.includes( `${sep}shared${sep}evaluators${sep}` ) && v.endsWith( '.js' )
};
