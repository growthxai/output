import { dirname } from 'node:path';
import { getTraceDestinations, sendHttpRequest } from '#internal_activities';
import { findSharedActivitiesFromWorkflows, importComponents, matchFiles, writeFileInTempDir } from './tools.js';
import { buildActivityMatcher, staticMatchers } from './matchers.js';
import { ACTIVITY_SEND_HTTP_REQUEST, ACTIVITY_OPTIONS_FILENAME, ACTIVITY_GET_TRACE_DESTINATIONS } from '#consts';
import { createChildLogger } from '#logger';
import { ValidationError } from '#errors';

const log = createChildLogger( 'Activities Loader' );

/**
 * Load activities
 * - Scan local project and external workflow npm packages and look for shared activities.
 * - For each workflow, register shared activities under the workflow namespace.
 * - For each workflow, load activities declared relative to that workflow directory.
 *
 * Builds a map of activities, key is workflowType#activityType, value is the component wrapper function.
 *
 * @param {string} rootDir
 * @param {import('./workflows.js').Workflow[]} workflows
 * @returns {object}
 */
export async function loadActivities( rootDir, workflows ) {
  const activities = new Map();
  const activityOptions = new Map();

  const sharedActivities = new Map();
  const sharedActivitiesOptions = new Map();

  // Load shared activities/evaluators from local and external npm modules
  const localSharedActivities = matchFiles( rootDir, [ staticMatchers.sharedStepsDir, staticMatchers.sharedEvaluatorsDir ] );
  const externalSharedActivities = findSharedActivitiesFromWorkflows( workflows.filter( w => w.external ) );
  for await ( const { fn, metadata, path } of importComponents( [ ...localSharedActivities, ...externalSharedActivities ] ) ) {
    const external = externalSharedActivities.some( a => a.path === path );

    if ( sharedActivities.has( metadata.name ) ) {
      throw new ValidationError( `Shared activity "${metadata.name}" conflicts with another shared activity.` +
        ' Shared activity names must be unique.' );
    }
    log.info( metadata.name, { shared: true, type: metadata.type, ...( external && { external } ), path } );

    sharedActivities.set( metadata.name, fn );
    if ( metadata.options?.activityOptions ) {
      sharedActivitiesOptions.set( metadata.name, metadata.options.activityOptions );
    }
  }

  // Discover and load workflow activities
  for ( const { path: workflowPath, name: workflowName, external } of workflows ) {
    const dir = dirname( workflowPath );

    // Add shared activities to this workflow namespace
    for ( const [ name, fn ] of sharedActivities ) {
      const id = `${workflowName}#${name}`;
      activities.set( id, fn );
      if ( sharedActivitiesOptions.has( name ) ) {
        activityOptions.set( id, sharedActivitiesOptions.get( name ) );
      }
    }

    for await ( const { fn, metadata, path } of importComponents( matchFiles( dir, [ buildActivityMatcher( dir ) ] ) ) ) {
      // Activities loaded from a workflow path will use the workflow name as a namespace, which is unique across the platform, avoiding collision
      const id = `${workflowName}#${metadata.name}`;

      if ( sharedActivities.has( metadata.name ) ) {
        throw new ValidationError( `Activity "${metadata.name}" in workflow "${workflowName}" conflicts with a shared activity.` +
          ' Workflow activity names must not overlap with shared activity names.' );
      }

      if ( activities.has( id ) ) {
        throw new ValidationError( `Activity "${metadata.name}" in workflow "${workflowName}" conflicts with another activity in the same workflow.` +
          ' Activity names must be unique within a workflow.' );
      }

      log.info( metadata.name, { workflow: workflowName, type: metadata.type, ...( external && { external } ), path } );
      activities.set( id, fn );
      if ( metadata.options?.activityOptions ) {
        activityOptions.set( id, metadata.options.activityOptions );
      }
    }
  }

  // writes down the activity option overrides
  const optionsContent = `export default ${JSON.stringify( Object.fromEntries( activityOptions ), undefined, 2 )};`;
  const optionsFile = writeFileInTempDir( optionsContent, ACTIVITY_OPTIONS_FILENAME );

  // system activities
  activities.set( ACTIVITY_SEND_HTTP_REQUEST, sendHttpRequest );
  activities.set( ACTIVITY_GET_TRACE_DESTINATIONS, getTraceDestinations );
  return { activities: Object.fromEntries( activities ), optionsFile };
};
