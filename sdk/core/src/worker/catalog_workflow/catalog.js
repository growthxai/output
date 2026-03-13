/**
 * Represents the collection of metadata from workflows and activities that a worker has.
 */
export class Catalog {
  /**
   * All workflows in the catalog
   * @type {Array<CatalogWorkflow>}
   */
  workflows;

  constructor() {
    this.workflows = [];
  };

  /**
   * Add a workflow entry to the catalog.
   *
   * @param {CatalogWorkflow} workflow - Workflow to add.
   * @returns {Catalog} This catalog instance (for chaining).
   */
  addWorkflow( workflow ) {
    this.workflows.push( workflow );
    return this;
  }
}

/**
 * Base type for catalog entries (workflows, activities).
 *
 * Encapsulates common descriptive fields and JSON schemas.
 */
class CatalogEntry {
  /**
   * Name of the entry. Only letters, numbers and _ allowed.
   * @type {string}
   */
  name;
  /**
   * Optional description.
   * @type {string|undefined}
   */
  description;
  /**
   * JSON schema describing the expected input.
   * @type {object}
   */
  inputSchema;
  /**
   * JSON schema describing the produced output.
   * @type {object}
   */
  outputSchema;
  /**
   * Absolute path of the entity in the file system.
   * @type {string}
   */
  path;

  /**
   * @param {Object} params - Entry parameters.
   * @param {string} params.name - Name of the entry.
   * @param {string} [params.description] - Optional description.
   * @param {object} [params.inputSchema] - JSON schema describing the expected input.
   * @param {object} [params.outputSchema] - JSON schema describing the produced output.
   * @param {string} params.path - Absolute path of the entity in the file system.
   */
  constructor( { name, description, inputSchema, outputSchema, path } ) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.path = path;
  };
}

/**
 * Describes a single activity within a workflow.
 *
 * @class
 * @extends CatalogEntry
 */
export class CatalogActivity extends CatalogEntry {}

/**
 * @param { CatalogWorkflowOptions}
 */

/**
 * Describes a single workflow within the catalog.
 *
 * @class
 * @extends CatalogEntry
 */
export class CatalogWorkflow extends CatalogEntry {
  /**
   * Each activity of this workflow.
   * @type {Array<CatalogActivity>}
   */
  activities;

  /**
   * @param {Object} params - Entry parameters.
   * @param {string} params.name - Name of the entry.
   * @param {string} [params.description] - Optional description.
   * @param {object} [params.inputSchema] - JSON schema describing the expected input.
   * @param {object} [params.outputSchema] - JSON schema describing the produced output.
   * @param {string} params.path - Absolute path of the entity in the file system.
   * @param {Array<CatalogActivity>} params.activities - Each activity of this workflow
   */
  constructor( { activities, ...args } ) {
    super( args );
    this.activities = activities;
  };
};
