import { z } from 'zod';
import { dirname } from 'node:path';
import { METADATA_ACCESS_SYMBOL } from '#consts';
import { Catalog, CatalogActivity, CatalogWorkflow } from './catalog.js';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Catalog' );

/**
 * Converts a Zod schema to JSON Schema format.
 *
 * @param {any} schema - A zod schema
 * @returns {object|null} JSON Schema object, or null if schema is invalid
 */
const convertToJsonSchema = schema => {
  if ( !schema ) {
    return null;
  }

  try {
    return z.toJSONSchema( schema );
  } catch ( error ) {
    log.warn( 'Invalid schema provided (expected Zod schema)', { error: error.message } );
    return null;
  }
};

/**
 * Converts the list of workflows and the activities into the catalog information.
 *
 * This has information of all workflows and their activities from this worker.
 *
 * @param {object[]} workflows - The workflows objects, as they are returned from the loader module
 * @param {object} activities - The activities functions map with metadata, as they are returned from the loader module
 * @returns {Catalog} An catalog instance
 */
export const createCatalog = ( { workflows, activities } ) =>
  workflows.reduce( ( catalog, workflow ) =>
    catalog.addWorkflow( new CatalogWorkflow( {
      ...workflow,
      inputSchema: convertToJsonSchema( workflow.inputSchema ),
      outputSchema: convertToJsonSchema( workflow.outputSchema ),
      activities: Object.entries( activities )
        .filter( ( [ k ] ) => k.startsWith( `${dirname( workflow.path )}#` ) )
        .map( ( [ _, v ] ) => {
          const metadata = v[METADATA_ACCESS_SYMBOL];
          return new CatalogActivity( {
            ...metadata,
            inputSchema: convertToJsonSchema( metadata.inputSchema ),
            outputSchema: convertToJsonSchema( metadata.outputSchema )
          } );
        } )
    } ) )
  , new Catalog() );
