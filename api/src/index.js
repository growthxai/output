import express from 'express';
import { z } from 'zod';
import temporalClient from './clients/temporal_client.js';
import { api as apiConfig, isProduction } from '#configs';
import { logger } from '#logger';
import requestIdMiddleware from './middleware/request_id.js';
import { createHttpLoggingMiddleware } from './middleware/http_logger.js';
import errorHandler from './middleware/error_handler.js';
import { createTraceLogHandler } from './handlers/trace_log.js';

const runIdQuerySchema = z.object( { runId: z.string().optional() } );

const app = express();

const client = await temporalClient.init().catch( e => {
  logger.error( 'Failed to initialize Temporal client', { error: e.message, errorType: e.constructor.name, stack: e.stack } );
  process.exit( 1 );
} );

// Sets payload limit for POST in application/json format. Some workflow have very large payloads
app.use( express.json( { limit: '2mb' } ) );
// Also sets payload limit for POST in application/x-www-form-urlencode format,
app.use( express.urlencoded( { extended: true, limit: '2mb' } ) );
// Request ID tracking
app.use( requestIdMiddleware );
// HTTP request logging via Morgan → Winston
app.use( createHttpLoggingMiddleware() );

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check the API
 *     responses:
 *       200:
 *         description: It is healthy
 */
app.get( '/health', ( _req, res ) => {
  res.sendStatus( 200 );
} );

// Auth logic (skip in development mode or for /health endpoint)
app.use( ( req, res, next ) => {
  if ( !isProduction || req.url === '/health' ) {
    return next();
  }

  const token = req.headers.authorization?.replace( /^Basic\s/, '' );
  return token === apiConfig.authToken ? next() : res.sendStatus( 401 );
} );

// CORS middleware
app.use( ( req, res, next ) => {
  res.header( 'Access-Control-Allow-Origin', '*' );
  res.header( 'Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS' );
  res.header( 'Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization' );

  return req.method === 'OPTIONS' ? res.sendStatus( 200 ) : next();
} );

/**
 * @typedef {Object} TraceData
 * @property {string} [workflowId] - The workflow execution ID
 * @property {Object} [input] - The workflow input
 * @property {Object} [output] - The workflow output
 * @property {Array} [steps] - The workflow execution steps
 */

/**
 * @typedef {Object} TraceLogRemoteResponse
 * @property {"remote"} source - Source type indicator for remote trace
 * @property {TraceData} data - Trace data fetched from S3
 */

/**
 * @typedef {Object} TraceLogLocalResponse
 * @property {"local"} source - Source type indicator for local trace
 * @property {string} localPath - Absolute path to local trace file
 */

/**
 * @typedef {TraceLogRemoteResponse | TraceLogLocalResponse} TraceLogResponse
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       description: API error body (WorkflowNotFoundError, WorkflowExecutionTimedOutError, WorkflowNotCompletedError, CatalogNotAvailableError, or server error)
 *       properties:
 *         error:
 *           type: string
 *           description: Error type name (e.g. WorkflowNotFoundError, CatalogNotAvailableError)
 *         message:
 *           type: string
 *           description: Human-readable error message
 *         workflowId:
 *           type: string
 *           description: Workflow ID when the error is tied to a specific execution (e.g. timeout)
 *           nullable: true
 *     ValidationErrorResponse:
 *       type: object
 *       description: Request body validation failure (Zod)
 *       properties:
 *         error:
 *           type: string
 *           enum: [ValidationError]
 *         message:
 *           type: string
 *           example: Invalid Payload
 *         issues:
 *           type: array
 *           description: Zod validation issues
 *           items:
 *             type: object
 *     JSONSchema:
 *       type: object
 *       additionalProperties: true
 *       properties:
 *         $schema:
 *           type: string
 *         type:
 *           type: string
 *         properties:
 *           type: object
 *           additionalProperties:
 *             $ref: '#/components/schemas/JSONSchema'
 *         items:
 *           $ref: '#/components/schemas/JSONSchema'
 *         required:
 *           type: array
 *           items:
 *             type: string
 *         description:
 *           type: string
 *         additionalProperties:
 *           type: boolean
 *         propertyNames:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *         anyOf:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/JSONSchema'
 *     Workflow:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: The name of the workflow
 *         description:
 *           type: string
 *           description: The description of the workflow
 *         path:
 *           type: string
 *           description: Absolute path to the workflow file
 *         inputSchema:
 *           $ref: '#/components/schemas/JSONSchema'
 *         outputSchema:
 *           $ref: '#/components/schemas/JSONSchema'
 *         aliases:
 *           type: array
 *           description: Alternative names that resolve to this workflow
 *           items:
 *             type: string
 *     TraceInfo:
 *       type: object
 *       description: An object with information about the trace generated by the execution
 *       properties:
 *         destinations:
 *           type: object
 *           description: File destinations for trace data
 *           required:
 *             - local
 *             - remote
 *           properties:
 *             local:
 *               type: string
 *               nullable: true
 *               description: Absolute path to local trace file, or null if not saved locally
 *             remote:
 *               type: string
 *               nullable: true
 *               description: Remote trace location (e.g., S3 URI), or null if not saved remotely
 *     TraceData:
 *       type: object
 *       description: Trace data containing workflow execution details
 *       additionalProperties: true
 *       properties:
 *         workflowId:
 *           type: string
 *           description: The workflow execution ID
 *         input:
 *           type: object
 *           description: The workflow input
 *         output:
 *           type: object
 *           description: The workflow output
 *         steps:
 *           type: array
 *           description: The workflow execution steps
 *           items:
 *             type: object
 *     TraceLogRemoteResponse:
 *       type: object
 *       required:
 *         - source
 *         - data
 *       properties:
 *         source:
 *           type: string
 *           enum: [remote]
 *           description: Indicates trace was fetched from remote storage
 *         runId:
 *           type: string
 *           nullable: true
 *           description: The specific run id for this trace
 *         data:
 *           $ref: '#/components/schemas/TraceData'
 *     TraceLogLocalResponse:
 *       type: object
 *       required:
 *         - source
 *         - localPath
 *       properties:
 *         source:
 *           type: string
 *           enum: [local]
 *           description: Indicates trace is available locally
 *         runId:
 *           type: string
 *           nullable: true
 *           description: The specific run id for this trace
 *         localPath:
 *           type: string
 *           description: Absolute path to local trace file
 *     WorkflowRunInfo:
 *       type: object
 *       properties:
 *         workflowId:
 *           type: string
 *           description: Unique identifier for this run
 *         workflowType:
 *           type: string
 *           description: Name of the workflow definition
 *         status:
 *           type: string
 *           enum: [running, completed, failed, canceled, terminated, timed_out, continued]
 *           description: Current run status
 *         startedAt:
 *           type: string
 *           format: date-time
 *           description: ISO 8601 timestamp of run start
 *         completedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: ISO 8601 timestamp of completion, or null if still running
 *     WorkflowRunsResponse:
 *       type: object
 *       properties:
 *         runs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/WorkflowRunInfo'
 *         count:
 *           type: integer
 *           description: Total number of runs returned
 *   responses:
 *     BadRequest:
 *       description: Invalid request body or query (validation failed)
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ValidationErrorResponse'
 *     NotFound:
 *       description: Workflow execution, workflow type, or catalog not found
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     RequestTimeout:
 *       description: Synchronous execution timed out before workflow completed
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     FailedDependency:
 *       description: Workflow not in a terminal state (still running)
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     ServiceUnavailable:
 *       description: Catalog workflow unavailable (worker not running or still starting). Retry-After header may be set.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     InternalServerError:
 *       description: Internal server error (e.g. Temporal connection failure)
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /workflow/run:
 *   post:
 *     summary: Execute a workflow synchronously
 *     description: Executes a workflow and waits for it to complete before returning the result
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workflowName
 *               - input
 *             properties:
 *               workflowName:
 *                 type: string
 *                 description: The name of the workflow to execute
 *               input:
 *                 description: The payload to send to the workflow
 *               workflowId:
 *                 type: string
 *                 description: (Optional) The workflowId to use. Must be unique
 *               taskQueue:
 *                 type: string
 *                 description: The name of the task queue to send the workflow to
 *               timeout:
 *                 type: number
 *                 description: (Optional) The max time to wait for the execution, defaults to 30s
 *     responses:
 *       200:
 *         description: The workflow result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                   description: The workflow execution id
 *                 output:
 *                   description: The output of the workflow, null if workflow failed
 *                 trace:
 *                   $ref: '#/components/schemas/TraceInfo'
 *                 status:
 *                   type: string
 *                   enum: [completed, failed]
 *                   description: The workflow execution status
 *                 error:
 *                   type: string
 *                   nullable: true
 *                   description: Error message if workflow failed, null otherwise
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       408:
 *         $ref: '#/components/responses/RequestTimeout'
 *       503:
 *         $ref: '#/components/responses/ServiceUnavailable'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/run', async ( req, res ) => {
  const { workflowName, input, workflowId, taskQueue, timeout } = z.object( {
    workflowName: z.string(),
    input: z.any().optional(),
    workflowId: z.string().optional(),
    taskQueue: z.string().optional(),
    timeout: z.coerce.number().int().min( 250 ).optional()
  } ).parse( req.body );
  res.json( await client.runWorkflow( workflowName, input, { workflowId, taskQueue, timeout } ) );
} );

/**
 * @swagger
 * /workflow/start:
 *   post:
 *     summary: Start a workflow asynchronously
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workflowName
 *               - input
 *             properties:
 *               workflowName:
 *                 type: string
 *                 description: The name of the workflow to execute
 *               input:
 *                 description: The payload to send to the workflow
 *               workflowId:
 *                 type: string
 *                 description: (Optional) The workflowId to use. Must be unique
 *               taskQueue:
 *                 type: string
 *                 description: The name of the task queue to send the workflow to
 *     responses:
 *       200:
 *         description: The workflow start result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                   description: The id of the started workflow
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/start', async ( req, res ) => {
  const { workflowName, input, workflowId, taskQueue } = z.object( {
    workflowName: z.string(),
    input: z.any().optional(),
    workflowId: z.string().optional(),
    taskQueue: z.string().optional()
  } ).parse( req.body );

  res.json( await client.startWorkflow( workflowName, input, { workflowId, taskQueue } ) );
} );

/**
 * @swagger
 * /workflow/{id}/status:
 *   get:
 *     summary: Get workflow execution status
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to retrieve the status
 *      - in: query
 *        name: runId
 *        required: false
 *        schema:
 *          type: string
 *        description: Optional specific run id. When omitted, resolves to the latest run.
 *     responses:
 *       200:
 *         description: The workflow status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                   description: The id of workflow
 *                 runId:
 *                   type: string
 *                   nullable: true
 *                   description: The specific run id for this execution
 *                 status:
 *                   type: string
 *                   enum: [canceled, completed, continued_as_new, failed, running, terminated, timed_out, unspecified]
 *                   description: The workflow execution status
 *                 startedAt:
 *                   type: number
 *                   description: An epoch timestamp representing when the workflow started
 *                 completedAt:
 *                   type: number
 *                   description: An epoch timestamp representing when the workflow ended
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.get( '/workflow/:id/status', async ( req, res ) => {
  const { runId } = runIdQuerySchema.parse( req.query );
  res.json( await client.getWorkflowStatus( req.params.id, runId ) );
} );

/**
 * @swagger
 * /workflow/{id}/stop:
 *   patch:
 *     summary: Stop a workflow execution
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to stop
 *      - in: query
 *        name: runId
 *        required: false
 *        schema:
 *          type: string
 *        description: Optional specific run id. When omitted, resolves to the latest run.
 *     responses:
 *       200:
 *         description: The workflow stopped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                 runId:
 *                   type: string
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.patch( '/workflow/:id/stop', async ( req, res ) => {
  const { runId } = runIdQuerySchema.parse( req.query );
  res.json( await client.stopWorkflow( req.params.id, runId ) );
} );

/**
 * @swagger
 * /workflow/{id}/terminate:
 *   post:
 *     summary: Terminate a workflow execution (force stop)
 *     description: Force terminates a workflow. Unlike stop/cancel, terminate immediately stops the workflow without allowing cleanup.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to terminate
 *      - in: query
 *        name: runId
 *        required: false
 *        schema:
 *          type: string
 *        description: Optional specific run id. When omitted, resolves to the latest run.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Optional reason for termination
 *     responses:
 *       200:
 *         description: The workflow was terminated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 terminated:
 *                   type: boolean
 *                 workflowId:
 *                   type: string
 *                 runId:
 *                   type: string
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/:id/terminate', async ( req, res ) => {
  const { reason } = z.object( { reason: z.string().optional() } ).optional().default( {} ).parse( req.body );
  const { runId } = runIdQuerySchema.parse( req.query );

  const info = await client.terminateWorkflow( req.params.id, reason, runId );
  res.json( { terminated: true, ...info } );
} );

/**
 * @swagger
 * /workflow/{id}/reset:
 *   post:
 *     summary: Reset a workflow to re-run from after a specific step
 *     description: Resets a workflow execution to the point after a completed step, creating a new run that replays from that point. The current execution is terminated.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The workflow ID to reset
 *      - in: query
 *        name: runId
 *        required: false
 *        schema:
 *          type: string
 *        description: Optional specific run id to reset. When omitted, resolves to the latest run.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stepName
 *             properties:
 *               stepName:
 *                 type: string
 *                 description: The name of the step to reset after
 *               reason:
 *                 type: string
 *                 description: Optional reason for the reset
 *     responses:
 *       200:
 *         description: The workflow was reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                   description: The original workflow ID
 *                 runId:
 *                   type: string
 *                   description: The run ID of the new execution created by the reset
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Step has not completed yet (conflict with current workflow state)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/:id/reset', async ( req, res ) => {
  const { stepName, reason } = z.object( {
    stepName: z.string(),
    reason: z.string().optional()
  } ).parse( req.body );
  const { runId } = runIdQuerySchema.parse( req.query );

  res.json( await client.resetWorkflow( req.params.id, stepName, reason, runId ) );
} );

/**
 * @swagger
 * /workflow/{id}/result:
 *   get:
 *     summary: Return the result of a workflow
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to retrieve the result
 *      - in: query
 *        name: runId
 *        required: false
 *        schema:
 *          type: string
 *        description: Optional specific run id. When omitted, resolves to the latest run.
 *     responses:
 *       200:
 *         description: The workflow result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflowId:
 *                   type: string
 *                   description: The workflow execution id
 *                 runId:
 *                   type: string
 *                   nullable: true
 *                   description: The specific run id for this execution
 *                 input:
 *                   description: The original input passed to the workflow, null if unavailable
 *                 output:
 *                   description: The result of workflow, null if workflow failed
 *                 trace:
 *                   $ref: '#/components/schemas/TraceInfo'
 *                 status:
 *                   type: string
 *                   enum: [completed, failed, canceled, terminated, timed_out, continued]
 *                   description: The workflow execution status
 *                 error:
 *                   type: string
 *                   nullable: true
 *                   description: Error message if workflow failed, null otherwise
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       424:
 *         $ref: '#/components/responses/FailedDependency'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.get( '/workflow/:id/result', async ( req, res ) => {
  const { runId } = runIdQuerySchema.parse( req.query );
  res.json( await client.getWorkflowResult( req.params.id, runId ) );
} );

/**
 * @swagger
 * /workflow/{id}/trace-log:
 *   get:
 *     summary: Get workflow trace log data
 *     description: Returns trace data for a completed workflow. If trace is stored remotely (S3), fetches and returns the data inline. If trace is local only, returns the local path.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to retrieve trace log
 *      - in: query
 *        name: runId
 *        required: false
 *        schema:
 *          type: string
 *        description: Optional specific run id. When omitted, resolves to the latest run.
 *     responses:
 *       200:
 *         description: The trace log response
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/TraceLogRemoteResponse'
 *                 - $ref: '#/components/schemas/TraceLogLocalResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       424:
 *         $ref: '#/components/responses/FailedDependency'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.get( '/workflow/:id/trace-log', createTraceLogHandler( client ) );

/**
 * @swagger
 * /workflow/catalog/{id}:
 *   get:
 *     summary: Get a specific workflow catalog by ID
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of the catalog
 *     responses:
 *       200:
 *         description: The catalog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflows:
 *                   type: array
 *                   description: Each workflow available in this catalog
 *                   items:
 *                     $ref: '#/components/schemas/Workflow'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.get( '/workflow/catalog/:id', async ( req, res ) => {
  res.json( await client.queryWorkflow( req.params.id, 'get' ) );
} );

/**
 * @swagger
 * /workflow/catalog:
 *   get:
 *     summary: Get the default workflow catalog
 *     responses:
 *       200:
 *         description: The catalog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workflows:
 *                   type: array
 *                   description: Each workflow available in this catalog
 *                   items:
 *                     $ref: '#/components/schemas/Workflow'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.get( '/workflow/catalog', async ( _req, res ) => {
  res.json( await client.queryWorkflow( apiConfig.defaultCatalogWorkflow, 'get' ) );
} );

/**
 * @swagger
 * /workflow/runs:
 *   get:
 *     summary: List workflow runs
 *     description: Returns a list of workflow runs with optional filtering by workflow type
 *     parameters:
 *       - in: query
 *         name: workflowType
 *         schema:
 *           type: string
 *         description: Filter by workflow type/name
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           minimum: 1
 *           maximum: 1000
 *         description: Maximum number of runs to return
 *     responses:
 *       200:
 *         description: List of workflow runs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkflowRunsResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.get( '/workflow/runs', async ( req, res ) => {
  const { workflowType, limit } = z.object( {
    workflowType: z.string().optional(),
    limit: z.coerce.number().int().min( 1 ).max( 1000 ).default( 100 )
  } ).parse( req.query );
  res.json( await client.listWorkflowRuns( { workflowType, limit } ) );
} );

/**
 * @swagger
 * /workflow/{id}/feedback:
 *   post:
 *     summary: Send feedback to a workflow
 *     description: Always targets the latest run of the workflow; runId cannot be pinned for signal-based operations.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The workflow id
 *     requestBody:
 *       description: Body must contain payload; payload is sent to Temporal
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 description: The payload sent to the workflow
 *                 type: object
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/:id/feedback', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );

  await client.sendSignal( req.params.id, 'resume', payload );
  res.sendStatus( 200 );
} );

/**
 * @swagger
 * /workflow/{id}/signal/{signal}:
 *   post:
 *     summary: Send a signal to an workflow
 *     description: Always targets the latest run of the workflow; runId cannot be pinned for signal operations.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The workflow id
 *      - in: path
 *        name: signal
 *        required: true
 *        schema:
 *          type: string
 *        description: The signal name
 *     requestBody:
 *       description: Body must contain payload; payload is sent to Temporal
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 description: The payload sent to the signal operation
 *                 type: object
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/:id/signal/:signal', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );

  await client.sendSignal( req.params.id, req.params.signal, payload );
  res.sendStatus( 200 );
} );

/**
 * @swagger
 * /workflow/{id}/query/{query}:
 *   post:
 *     summary: Send a query to an workflow
 *     description: Always targets the latest run of the workflow; runId cannot be pinned for query operations.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The workflow id
 *      - in: path
 *        name: query
 *        required: true
 *        schema:
 *          type: string
 *        description: The query name
 *     requestBody:
 *       description: Body must contain payload; payload is sent to Temporal
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 description: The payload sent to the query operation
 *                 type: object
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/:id/query/:query', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );

  const result = await client.sendQuery( req.params.id, req.params.query, payload );
  res.status( 200 ).json( result );
} );

/**
 * @swagger
 * /workflow/{id}/update/{update}:
 *   post:
 *     summary: Execute an update on an workflow
 *     description: Always targets the latest run of the workflow; runId cannot be pinned for update operations.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The workflow id
 *      - in: path
 *        name: update
 *        required: true
 *        schema:
 *          type: string
 *        description: The update name
 *     requestBody:
 *       description: Body must contain payload; payload is sent to Temporal
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload:
 *                 description: The payload sent to the update operation
 *                 type: object
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
app.post( '/workflow/:id/update/:update', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );

  const result = await client.executeUpdate( req.params.id, req.params.update, payload );
  res.status( 200 ).json( result );
} );

/**
 * @swagger
 * /heartbeat:
 *   post:
 *     summary: A dummy post endpoint for test only
 *     responses:
 *       204:
 *         description: Success
 */
app.post( '/heartbeat', async ( _req, res ) => {
  res.sendStatus( 204 );
} );

// all other requests are 404
app.use( ( _, res ) => {
  res.sendStatus( 404 );
} );

// default error handling
app.use( errorHandler );

const server = app.listen( apiConfig.port, () => {
  logger.info( 'API server started', { port: apiConfig.port, environment: apiConfig.envName } );
} );

const shutdown = async signal => {
  logger.info( `${signal} received, shutting down gracefully` );

  server.close( () => {
    logger.info( 'HTTP server closed' );

    client.close().then( () => {
      logger.info( 'Temporal client closed' );
    } ).catch( e => {
      logger.error( 'Error closing Temporal client', { error: e.message, errorType: e.constructor.name, stack: e.stack } );
      process.exit( 1 );
    } );
  } );
};

process.on( 'SIGTERM', () => shutdown( 'SIGTERM' ) );
process.on( 'SIGINT', () => shutdown( 'SIGINT' ) );
