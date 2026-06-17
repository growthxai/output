import { dirname } from 'node:path';
import { getTraceDestinations, sendHttpRequest } from '#internal_activities';
import { findSharedActivitiesFromWorkflows, importComponents, matchFiles, writeFileInTempDir } from './tools.js';
import { buildActivityMatcher, staticMatchers } from './matchers.js';
import { ACTIVITY_SEND_HTTP_REQUEST, ACTIVITY_OPTIONS_FILENAME, SHARED_STEP_PREFIX, ACTIVITY_GET_TRACE_DESTINATIONS } from '#consts';
import { createChildLogger } from '#logger';
import { ValidationError } from '#errors';

const log = createChildLogger( 'Activities Loader' );

/**
 * Load activities:
 * - Scans activities based on workflows, using each workflow folder as a point to lookup for steps, evaluators files;
 * - Scans shared activities in the rootDir;
 * - Loads internal activities as well;
 *
 * Builds a map of activities, where they is generated according to the type of activity and the value is the function itself and return it.
 * - Shared activity keys have a common prefix followed by the activity name;
 * - Internal activities are registered with a fixed key;
 * - Workflow activities keys are composed using the workflow name and the activity name;
 *
 * @param {string} rootDir
 * @param {import('./workflows.js').Workflow[]} workflows
 * @returns {object}
 */
export async function loadActivities( rootDir, workflows ) {
  const activities = {};
  const activityOptionsMap = {};

  // Load workflow-based activities
  for ( const { path: workflowPath, name: workflowName, external } of workflows ) {
    const dir = dirname( workflowPath );
    for await ( const { fn, metadata, path } of importComponents( matchFiles( dir, [ buildActivityMatcher( dir ) ] ) ) ) {
      // Activities loaded from a workflow path will use the workflow name as a namespace, which is unique across the platform, avoiding collision
      const activityKey = `${workflowName}#${metadata.name}`;

      log.info( metadata.name, { workflow: workflowName, type: metadata.type, ...( external && { external } ), path } );

      if ( activities[activityKey] ) {
        throw new ValidationError( `Activity "${metadata.name}" in workflow "${workflowName}" conflicts with another \
activity in the same workflow. Activity names must be unique within a workflow.` );
      }
      activities[activityKey] = fn;
      // propagate the custom options set on the step()/evaluator() constructor
      activityOptionsMap[activityKey] = metadata.options?.activityOptions ?? undefined;
    }
  }

  // Load shared activities/evaluators from local and external npm modules
  const localSharedActivities = matchFiles( rootDir, [ staticMatchers.sharedStepsDir, staticMatchers.sharedEvaluatorsDir ] );
  const externalSharedActivities = findSharedActivitiesFromWorkflows( workflows.filter( w => w.external ) );
  for await ( const { fn, metadata, path } of importComponents( [ ...localSharedActivities, ...externalSharedActivities ] ) ) {
    const external = externalSharedActivities.some( a => a.path === path );
    // Uses a global namespace for shared activities
    const activityKey = `${SHARED_STEP_PREFIX}#${metadata.name}`;

    log.info( metadata.name, { shared: true, type: metadata.type, shared: true, ...( external && { external } ), path } );

    if ( activities[activityKey] ) {
      throw new ValidationError( `Shared activity "${metadata.name}" conflicts with another shared activity. \
Shared activity names must be unique.` );
    }
    activities[activityKey] = fn;
    activityOptionsMap[activityKey] = metadata.options?.activityOptions ?? undefined;
  }

  // writes down the activity option overrides
  const optionsContent = `export default ${JSON.stringify( activityOptionsMap, undefined, 2 )};`;
  const optionsFile = writeFileInTempDir( optionsContent, ACTIVITY_OPTIONS_FILENAME );

  // system activities
  activities[ACTIVITY_SEND_HTTP_REQUEST] = sendHttpRequest;
  activities[ACTIVITY_GET_TRACE_DESTINATIONS] = getTraceDestinations;
  return { activities, optionsFile };
};
