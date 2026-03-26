import express from 'express';
import { z } from 'zod';
import temporalClient from './clients/temporal_client.js';
import { api as apiConfig, isProduction } from '#configs';
import { logger } from '#logger';
import requestIdMiddleware from './middleware/request_id.js';
import { createHttpLoggingMiddleware } from './middleware/http_logger.js';
import errorHandler from './middleware/error_handler.js';
import { createTraceLogHandler } from './handlers/trace_log.js';

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

// Returns if the api is healthy
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

// All endpoints:

// Executes a workflow synchronously
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

// Starts the execution of a workflow asynchronously
app.post( '/workflow/start', async ( req, res ) => {
  const { workflowName, input, workflowId, taskQueue } = z.object( {
    workflowName: z.string(),
    input: z.any().optional(),
    workflowId: z.string().optional(),
    taskQueue: z.string().optional()
  } ).parse( req.body );
  res.json( await client.startWorkflow( workflowName, input, { workflowId, taskQueue } ) );
} );

// Returns the execution status of a workflow
app.get( '/workflow/:id/status', async ( req, res ) => {
  res.json( await client.getWorkflowStatus( req.params.id ) );
} );

// Stops a workflow execution
app.patch( '/workflow/:id/stop', async ( req, res ) => {
  res.json( await client.stopWorkflow( req.params.id ) );
} );

// Terminates a workflow execution (force stop)
app.post( '/workflow/:id/terminate', async ( req, res ) => {
  const { reason } = z.object( { reason: z.string().optional() } ).optional().default( {} ).parse( req.body );
  await client.terminateWorkflow( req.params.id, reason );
  res.json( { terminated: true, workflowId: req.params.id } );
} );

// Resets a workflow to re-run from after a specific step
app.post( '/workflow/:id/reset', async ( req, res ) => {
  const { stepName, reason } = z.object( {
    stepName: z.string(),
    reason: z.string().optional()
  } ).parse( req.body );
  res.json( await client.resetWorkflow( req.params.id, stepName, reason ) );
} );

// Returns the result of a workflow
app.get( '/workflow/:id/result', async ( req, res ) => {
  res.json( await client.getWorkflowResult( req.params.id ) );
} );

// Returns workflow trace log data
app.get( '/workflow/:id/trace-log', createTraceLogHandler( client ) );

// Returns a specific workflow catalog by ID
app.get( '/workflow/catalog/:id', async ( req, res ) => {
  res.json( await client.queryWorkflow( req.params.id, 'get' ) );
} );

// Returns the default workflow catalog
app.get( '/workflow/catalog', async ( _req, res ) => {
  res.json( await client.queryWorkflow( apiConfig.defaultCatalogWorkflow, 'get' ) );
} );

// Returns a list of workflow runs with optional filtering by workflow type
app.get( '/workflow/runs', async ( req, res ) => {
  const { workflowType, limit } = z.object( {
    workflowType: z.string().optional(),
    limit: z.coerce.number().int().min( 1 ).max( 1000 ).default( 100 )
  } ).parse( req.query );
  res.json( await client.listWorkflowRuns( { workflowType, limit } ) );
} );

// Sends a "resume" signal to a workflow
app.post( '/workflow/:id/feedback', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );
  await client.sendSignal( req.params.id, 'resume', payload );
  res.sendStatus( 200 );
} );

// Sends a signal to an workflow
app.post( '/workflow/:id/signal/:signal', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );
  await client.sendSignal( req.params.id, req.params.signal, payload );
  res.sendStatus( 200 );
} );

// Sends a query to an workflow
app.post( '/workflow/:id/query/:query', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );
  const result = await client.sendQuery( req.params.id, req.params.query, payload );
  res.status( 200 ).json( result );
} );

// Executes an update on an workflow
app.post( '/workflow/:id/update/:update', async ( req, res ) => {
  const { payload } = z.object( { payload: z.looseObject().optional() } ).optional().default( {} ).parse( req.body );
  const result = await client.executeUpdate( req.params.id, req.params.update, payload );
  res.status( 200 ).json( result );
} );

// A dummy post endpoint for test only
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
