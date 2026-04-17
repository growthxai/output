import express from 'express';
import { z } from 'zod';
import temporalClient from './clients/temporal_client.js';
import { api as apiConfig, isProduction } from '#configs';
import { logger } from '#logger';
import requestIdMiddleware from './middleware/request_id.js';
import { createHttpLoggingMiddleware } from './middleware/http_logger.js';
import errorHandler from './middleware/error_handler.js';
import deprecated from './middleware/deprecated.js';
import { createTraceLogHandler } from './handlers/trace_log.js';

const runIdPathSchema = z.string().uuid();

// Sunset date for the three deprecated `/workflow/:id/{stop,terminate,reset}` shortcuts.
// 90 days after the PR that introduces the pinned-run scheme.
const PINNED_MUTATION_SUNSET = '2026-07-16';

/**
 * Read the pinned runId from the path, if present, validating it is a UUID.
 * Returns undefined for shortcut routes where `:rid` is not part of the URL.
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
const readPinnedRunId = req => ( req.params.rid ? runIdPathSchema.parse( req.params.rid ) : undefined );

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
 *         - runId
 *         - data
 *       properties:
 *         source:
 *           type: string
 *           enum: [remote]
 *           description: Indicates trace was fetched from remote storage
 *         runId:
 *           type: string
 *           description: The specific run id this trace belongs to
 *         data:
 *           $ref: '#/components/schemas/TraceData'
 *     TraceLogLocalResponse:
 *       type: object
 *       required:
 *         - source
 *         - runId
 *         - localPath
 *       properties:
 *         source:
 *           type: string
 *           enum: [local]
 *           description: Indicates trace is available locally
 *         runId:
 *           type: string
 *           description: The specific run id this trace belongs to
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
 *     WorkflowStatusResponse:
 *       type: object
 *       properties:
 *         workflowId:
 *           type: string
 *           description: The id of workflow
 *         runId:
 *           type: string
 *           nullable: true
 *           description: The specific run id for this execution
 *         status:
 *           type: string
 *           enum: [canceled, completed, continued_as_new, failed, running, terminated, timed_out, unspecified]
 *           description: The workflow execution status
 *         startedAt:
 *           type: number
 *           description: An epoch timestamp representing when the workflow started
 *         completedAt:
 *           type: number
 *           description: An epoch timestamp representing when the workflow ended
 *     WorkflowResultResponse:
 *       type: object
 *       properties:
 *         workflowId:
 *           type: string
 *           description: The workflow execution id
 *         runId:
 *           type: string
 *           nullable: true
 *           description: The specific run id for this execution
 *         input:
 *           description: The original input passed to the workflow, null if unavailable
 *         output:
 *           description: The result of workflow, null if workflow failed
 *         trace:
 *           $ref: '#/components/schemas/TraceInfo'
 *         status:
 *           type: string
 *           enum: [completed, failed, canceled, terminated, timed_out, continued]
 *           description: The workflow execution status
 *         error:
 *           type: string
 *           nullable: true
 *           description: Error message if workflow failed, null otherwise
 *     StopWorkflowResponse:
 *       type: object
 *       properties:
 *         workflowId:
 *           type: string
 *         runId:
 *           type: string
 *           nullable: true
 *     TerminateWorkflowResponse:
 *       type: object
 *       properties:
 *         terminated:
 *           type: boolean
 *         workflowId:
 *           type: string
 *         runId:
 *           type: string
 *           nullable: true
 *     ResetWorkflowRequest:
 *       type: object
 *       required: [stepName]
 *       properties:
 *         stepName:
 *           type: string
 *           description: The name of the step to reset after
 *         reason:
 *           type: string
 *           description: Optional reason for the reset
 *     ResetWorkflowResponse:
 *       type: object
 *       properties:
 *         workflowId:
 *           type: string
 *           description: The original workflow ID
 *         runId:
 *           type: string
 *           description: The run ID of the new execution created by the reset
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
 *     Conflict:
 *       description: Workflow run is in a state that conflicts with the requested operation (e.g. operating on an already-terminal run, or resetting to an incomplete step).
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
 *                 runId:
 *                   type: string
 *                   nullable: true
 *                   description: The first execution's run id for this workflow
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
 *     summary: Get workflow execution status (latest run)
 *     description: Returns the status of the latest run for the given workflow. To pin a specific run, use `/workflow/{id}/runs/{rid}/status`.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to retrieve the status
 *     responses:
 *       200:
 *         description: The workflow status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkflowStatusResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /workflow/{id}/runs/{rid}/status:
 *   get:
 *     summary: Get workflow execution status for a specific run
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow
 *      - in: path
 *        name: rid
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *        description: The specific run id to target
 *     responses:
 *       200:
 *         description: The workflow status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkflowStatusResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const statusHandler = async ( req, res ) => {
  res.json( await client.getWorkflowStatus( req.params.id, readPinnedRunId( req ) ) );
};
app.get( '/workflow/:id/status', statusHandler );
app.get( '/workflow/:id/runs/:rid/status', statusHandler );

/**
 * @swagger
 * /workflow/{id}/runs/{rid}/stop:
 *   patch:
 *     summary: Stop a specific workflow run
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *      - in: path
 *        name: rid
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *        description: The specific run id to stop
 *     responses:
 *       200:
 *         description: The workflow run was stopped
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StopWorkflowResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /workflow/{id}/stop:
 *   patch:
 *     deprecated: true
 *     summary: "[Deprecated] Stop the latest workflow run"
 *     description: Stops the latest run of the given workflow. Deprecated; use `PATCH /workflow/{id}/runs/{rid}/stop` to target a specific run. Scheduled for removal after 2026-07-16.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *     responses:
 *       200:
 *         description: The workflow run was stopped
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StopWorkflowResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const stopHandler = async ( req, res ) => {
  res.json( await client.stopWorkflow( req.params.id, readPinnedRunId( req ) ) );
};
app.patch( '/workflow/:id/runs/:rid/stop', stopHandler );
app.patch(
  '/workflow/:id/stop',
  deprecated( { successor: '/workflow/{id}/runs/{rid}/stop', sunset: PINNED_MUTATION_SUNSET } ),
  stopHandler
);

/**
 * @swagger
 * /workflow/{id}/runs/{rid}/terminate:
 *   post:
 *     summary: Terminate a specific workflow run (force stop)
 *     description: Force terminates a workflow run. Unlike stop/cancel, terminate immediately stops the run without allowing cleanup.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *      - in: path
 *        name: rid
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *        description: The specific run id to terminate
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
 *         description: The workflow run was terminated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TerminateWorkflowResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /workflow/{id}/terminate:
 *   post:
 *     deprecated: true
 *     summary: "[Deprecated] Terminate the latest workflow run"
 *     description: Force terminates the latest run. Deprecated; use `POST /workflow/{id}/runs/{rid}/terminate` to target a specific run. Scheduled for removal after 2026-07-16.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: The workflow run was terminated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TerminateWorkflowResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const terminateHandler = async ( req, res ) => {
  const { reason } = z.object( { reason: z.string().optional() } ).optional().default( {} ).parse( req.body );
  const info = await client.terminateWorkflow( req.params.id, reason, readPinnedRunId( req ) );
  res.json( { terminated: true, ...info } );
};
app.post( '/workflow/:id/runs/:rid/terminate', terminateHandler );
app.post(
  '/workflow/:id/terminate',
  deprecated( { successor: '/workflow/{id}/runs/{rid}/terminate', sunset: PINNED_MUTATION_SUNSET } ),
  terminateHandler
);

/**
 * @swagger
 * /workflow/{id}/runs/{rid}/reset:
 *   post:
 *     summary: Reset a specific workflow run to re-run from after a completed step
 *     description: Resets a pinned workflow run to the point after a completed step, creating a new run that replays from that point. The current execution is terminated.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The workflow ID to reset
 *      - in: path
 *        name: rid
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *        description: The specific run id to reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetWorkflowRequest'
 *     responses:
 *       200:
 *         description: The workflow was reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResetWorkflowResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /workflow/{id}/reset:
 *   post:
 *     deprecated: true
 *     summary: "[Deprecated] Reset the latest workflow run"
 *     description: Resets the latest run. Deprecated; use `POST /workflow/{id}/runs/{rid}/reset` to target a specific run. Scheduled for removal after 2026-07-16.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetWorkflowRequest'
 *     responses:
 *       200:
 *         description: The workflow was reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResetWorkflowResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const resetHandler = async ( req, res ) => {
  const { stepName, reason } = z.object( {
    stepName: z.string(),
    reason: z.string().optional()
  } ).parse( req.body );
  res.json( await client.resetWorkflow( req.params.id, stepName, reason, readPinnedRunId( req ) ) );
};
app.post( '/workflow/:id/runs/:rid/reset', resetHandler );
app.post(
  '/workflow/:id/reset',
  deprecated( { successor: '/workflow/{id}/runs/{rid}/reset', sunset: PINNED_MUTATION_SUNSET } ),
  resetHandler
);

/**
 * @swagger
 * /workflow/{id}/result:
 *   get:
 *     summary: Return the result of a workflow (latest run)
 *     description: Returns the result of the latest run for the given workflow. To pin a specific run, use `/workflow/{id}/runs/{rid}/result`.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to retrieve the result
 *     responses:
 *       200:
 *         description: The workflow result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkflowResultResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       424:
 *         $ref: '#/components/responses/FailedDependency'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *
 * /workflow/{id}/runs/{rid}/result:
 *   get:
 *     summary: Return the result of a specific workflow run
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *      - in: path
 *        name: rid
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *        description: The specific run id to target
 *     responses:
 *       200:
 *         description: The workflow result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkflowResultResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       424:
 *         $ref: '#/components/responses/FailedDependency'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const resultHandler = async ( req, res ) => {
  res.json( await client.getWorkflowResult( req.params.id, readPinnedRunId( req ) ) );
};
app.get( '/workflow/:id/result', resultHandler );
app.get( '/workflow/:id/runs/:rid/result', resultHandler );

/**
 * @swagger
 * /workflow/{id}/trace-log:
 *   get:
 *     summary: Get workflow trace log data (latest run)
 *     description: Returns trace data for the latest run of the given workflow. If trace is stored remotely (S3), fetches and returns the data inline. If trace is local only, returns the local path. To pin a specific run, use `/workflow/{id}/runs/{rid}/trace-log`.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *        description: The id of workflow to retrieve trace log
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
 *
 * /workflow/{id}/runs/{rid}/trace-log:
 *   get:
 *     summary: Get workflow trace log data for a specific run
 *     description: Returns trace data for a pinned workflow run. If trace is stored remotely (S3), fetches and returns the data inline. If trace is local only, returns the local path.
 *     parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        schema:
 *          type: string
 *      - in: path
 *        name: rid
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *        description: The specific run id to target
 *     responses:
 *       200:
 *         description: The trace log response
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/TraceLogRemoteResponse'
 *                 - $ref: '#/components/schemas/TraceLogLocalResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       424:
 *         $ref: '#/components/responses/FailedDependency'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const traceLogHandler = createTraceLogHandler( client );
app.get( '/workflow/:id/trace-log', traceLogHandler );
app.get( '/workflow/:id/runs/:rid/trace-log', traceLogHandler );

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
 *     description: Always targets the latest run; runId cannot be pinned for Temporal signal-based operations.
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
 *     description: Always targets the latest run; runId cannot be pinned for Temporal signal operations.
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
 *     description: Always targets the latest run; runId cannot be pinned for Temporal query operations.
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
 *     description: Always targets the latest run; runId cannot be pinned for Temporal update operations.
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
