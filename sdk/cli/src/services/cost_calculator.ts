import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

import type {
  TraceNode,
  LLMCall,
  HTTPCall,
  TokenUsage,
  PricingConfig,
  ModelPricing,
  ServiceConfig,
  LLMCostResult,
  ServiceCostResult,
  ServiceCostSummary,
  CostReport
} from '#types/cost.js';

const ARRAY_ACCESS_PATTERN = /^(\w+)\[(\d+)\]$/;

function tokenCost( tokens: number, pricePerMillion: number ): number {
  return ( tokens / 1_000_000 ) * pricePerMillion;
}

export function extractValue( obj: unknown, path: string ): unknown {
  if ( !path || !obj ) {
    return obj;
  }

  return path.split( '.' ).reduce<unknown>( ( current, part ) => {
    if ( current === null || current === undefined ) {
      return current;
    }
    const arrayMatch = part.match( ARRAY_ACCESS_PATTERN );
    if ( arrayMatch ) {
      const [ , key, index ] = arrayMatch;
      return ( current as Record<string, unknown[]> )[key]?.[parseInt( index, 10 )];
    }
    return ( current as Record<string, unknown> )[part];
  }, obj );
}

function loadYaml( filePath: string ): PricingConfig {
  return yaml.load( readFileSync( filePath, 'utf-8' ) ) as PricingConfig;
}

export function loadPricingConfig( configPath?: string ): PricingConfig {
  const bundledPath = new URL( '../assets/config/costs.yml', import.meta.url ).pathname;
  const bundled = loadYaml( configPath ?? bundledPath );

  const projectPath = join( process.cwd(), 'config', 'costs.yml' );
  if ( !configPath && existsSync( projectPath ) ) {
    const project = loadYaml( projectPath );
    return {
      models: { ...bundled.models, ...project.models },
      services: { ...bundled.services, ...project.services }
    };
  }

  return bundled;
}

function resolveStepName( node: TraceNode, parentStepName: string | null ): string | null {
  if ( node.kind === 'step' && node.name ) {
    return node.name.includes( '#' ) ?
      node.name.split( '#' ).pop()! :
      node.name;
  }
  return parentStepName;
}

function findCalls<T>(
  node: TraceNode,
  match: ( node: TraceNode ) => boolean,
  extract: ( node: TraceNode, parentStepName: string | null ) => T,
  parentStepName: string | null = null,
  seenIds: Set<string> = new Set()
): T[] {
  const calls: T[] = [];

  if ( match( node ) ) {
    const id = node.id;
    if ( id && seenIds.has( id ) ) {
      return calls;
    }
    if ( id ) {
      seenIds.add( id );
    }
    calls.push( extract( node, parentStepName ) );
  }

  const currentStepName = resolveStepName( node, parentStepName );
  if ( node.children ) {
    for ( const child of node.children ) {
      calls.push( ...findCalls( child, match, extract, currentStepName, seenIds ) );
    }
  }

  return calls;
}

export function findLLMCalls(
  node: TraceNode,
  parentStepName: string | null = null,
  seenIds: Set<string> = new Set()
): LLMCall[] {
  return findCalls<LLMCall>(
    node,
    n => n.kind === 'llm' && !!n.output?.usage,
    ( n, stepName ) => {
      const loadedPrompt = n.input?.loadedPrompt as
        Record<string, Record<string, unknown>> | undefined;
      const outputRecord = n.output as Record<string, unknown>;
      const inputRecord = n.input as Record<string, unknown>;

      const model =
        ( loadedPrompt?.config?.model as string ) ||
        ( outputRecord?.model as string ) ||
        ( inputRecord?.model as string ) ||
        'unknown';

      return {
        stepName: stepName || n.name || 'unknown',
        llmName: n.name || 'llm',
        model,
        usage: n.output!.usage!
      };
    },
    parentStepName,
    seenIds
  );
}

export function findHTTPCalls(
  node: TraceNode,
  parentStepName: string | null = null,
  seenIds: Set<string> = new Set()
): HTTPCall[] {
  return findCalls<HTTPCall>(
    node,
    n => n.kind === 'http',
    ( n, stepName ) => ( {
      stepName: stepName || 'unknown',
      url: ( n.input?.url as string ) || '',
      method: ( n.input?.method as string ) || 'GET',
      input: ( n.input as Record<string, unknown> ) || {},
      output: ( n.output as Record<string, unknown> ) || {},
      status: n.output?.status as number | undefined
    } ),
    parentStepName,
    seenIds
  );
}

export function calculateLLMCallCost(
  usage: TokenUsage,
  modelPricing: ModelPricing | undefined
): { cost: number; warning?: string } {
  if ( !modelPricing ) {
    return { cost: 0, warning: 'unknown model' };
  }

  const inputCost = tokenCost( usage.inputTokens ?? 0, modelPricing.input ?? 0 );
  const outputCost = tokenCost( usage.outputTokens ?? 0, modelPricing.output ?? 0 );
  const cachedCost = tokenCost( usage.cachedInputTokens ?? 0, modelPricing.cached_input ?? 0 );
  const reasoningCost =
    tokenCost( usage.reasoningTokens ?? 0, modelPricing.reasoning || modelPricing.output || 0 );

  return { cost: inputCost + outputCost + cachedCost + reasoningCost };
}

export function identifyService(
  httpCall: HTTPCall,
  services: Record<string, ServiceConfig>
): { serviceName: string; config: ServiceConfig } | null {
  if ( !services ) {
    return null;
  }

  for ( const [ serviceName, config ] of Object.entries( services ) ) {
    if ( httpCall.url.includes( config.url_pattern ) ) {
      return { serviceName, config };
    }
  }

  return null;
}

function calculateTokenServiceCost(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  if ( !config.usage_path ) {
    return { step: httpCall.stepName, cost: 0, usage: 'no usage data', warning: 'no usage data' };
  }

  const usage = extractValue( httpCall.output, config.usage_path );

  if ( config.input_field && config.output_field ) {
    const usageObj = usage as Record<string, number> | undefined;
    const inputTokens = usageObj?.[config.input_field] ?? 0;
    const outputTokens = usageObj?.[config.output_field] ?? 0;
    const inputCost = tokenCost( inputTokens, config.input_per_million ?? 0 );
    const outputCost = tokenCost( outputTokens, config.output_per_million ?? 0 );
    return {
      step: httpCall.stepName,
      cost: inputCost + outputCost,
      usage: `${( inputTokens + outputTokens ).toLocaleString( 'en-US' )} tokens`
    };
  }

  const tokens = typeof usage === 'number' ? usage : 0;
  if ( tokens === 0 ) {
    return { step: httpCall.stepName, cost: 0, usage: 'no usage data', warning: 'no usage data' };
  }

  const cost = tokenCost( tokens, config.per_million ?? 0 );
  return { step: httpCall.stepName, cost, usage: `${tokens.toLocaleString( 'en-US' )} tokens` };
}

function resolveUnitEndpoint(
  url: string,
  httpCall: HTTPCall,
  config: ServiceConfig
): { units: number; endpoint: string } {
  if ( !config.endpoints ) {
    return { units: 0, endpoint: 'unknown' };
  }

  for ( const [ endpointName, endpointConfig ] of Object.entries( config.endpoints ) ) {
    if ( !url.includes( endpointConfig.pattern ) ) {
      continue;
    }

    if ( endpointConfig.units_per_request ) {
      return { units: endpointConfig.units_per_request, endpoint: endpointName };
    }

    if ( endpointConfig.units_per_line ) {
      const body = httpCall.output?.body;
      if ( typeof body === 'string' ) {
        const lines = body.split( '\n' ).filter(
          ( l: string ) => l.trim() && !l.startsWith( 'ERROR' )
        );
        const units = Math.max( 0, lines.length - 1 ) * endpointConfig.units_per_line;
        return { units, endpoint: endpointName };
      }
    }

    return { units: 0, endpoint: endpointName };
  }

  return { units: 0, endpoint: 'unknown' };
}

function calculateUnitServiceCost(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  const { units, endpoint } = resolveUnitEndpoint( httpCall.url, httpCall, config );
  const cost = units * ( config.price_per_unit || 0 );
  return {
    step: httpCall.stepName,
    cost,
    usage: `${units.toLocaleString( 'en-US' )} units`,
    endpoint
  };
}

function calculateRequestServiceCost(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  if ( config.models && config.model_path ) {
    const model = extractValue( httpCall.input, config.model_path ) as string | undefined;
    const price = ( model && config.models[model] ) || config.default_price || 0;
    return { step: httpCall.stepName, cost: price, usage: '1 request', model };
  }

  if ( config.endpoints ) {
    for ( const [ endpointName, endpointConfig ] of Object.entries( config.endpoints ) ) {
      if ( httpCall.url.includes( endpointConfig.pattern ) ) {
        if ( endpointConfig.price !== undefined ) {
          return {
            step: httpCall.stepName,
            cost: endpointConfig.price,
            usage: '1 request',
            endpoint: endpointName
          };
        }
        if ( endpointConfig.price_per_item && endpointConfig.items_path ) {
          const items = extractValue( httpCall.input, endpointConfig.items_path );
          const count = Array.isArray( items ) ? items.length : 0;
          return {
            step: httpCall.stepName,
            cost: count * endpointConfig.price_per_item,
            usage: `${count} items`,
            endpoint: endpointName
          };
        }
      }
    }
  }

  return { step: httpCall.stepName, cost: 0, usage: 'unknown endpoint', warning: 'unknown endpoint' };
}

function calculateResponseCostService(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  const cost = extractValue( httpCall, config.cost_path! ) as number | undefined;

  if ( typeof cost === 'number' && cost > 0 ) {
    const costDollars = extractValue(
      httpCall, 'output.body.costDollars'
    ) as Record<string, number> | undefined;
    const model = extractValue( httpCall, 'output.body.model' ) as string | undefined;
    const numSearches = costDollars?.numSearches ?? 0;
    const numPages = costDollars?.numPages ?? 0;

    return {
      step: httpCall.stepName,
      cost,
      usage: `${numSearches} searches, ${Math.round( numPages )} pages`,
      model: model || 'unknown',
      details: costDollars
    };
  }

  if ( config.fallback_models ) {
    const model =
      ( extractValue( httpCall, 'input.body.model' ) as string ) ||
      ( extractValue( httpCall, 'output.body.model' ) as string ) ||
      'unknown';
    const fallbackPrice = config.fallback_models[model];
    if ( fallbackPrice ) {
      return {
        step: httpCall.stepName,
        cost: fallbackPrice,
        usage: '1 request (estimated)',
        model,
        warning: 'using fallback estimate'
      };
    }

    if ( config.default_fallback ) {
      return {
        step: httpCall.stepName,
        cost: config.default_fallback,
        usage: '1 request (estimated)',
        model: 'unknown',
        warning: 'using default estimate'
      };
    }
  }

  return { step: httpCall.stepName, cost: 0, usage: 'no cost data', warning: 'no cost data' };
}

export function calculateServiceCost(
  httpCall: HTTPCall,
  serviceInfo: { serviceName: string; config: ServiceConfig }
): ServiceCostResult {
  const { config } = serviceInfo;

  switch ( config.type ) {
    case 'token':
      return calculateTokenServiceCost( httpCall, config );
    case 'unit':
      return calculateUnitServiceCost( httpCall, config );
    case 'request':
      return calculateRequestServiceCost( httpCall, config );
    case 'response_cost':
      return calculateResponseCostService( httpCall, config );
    default:
      return { step: httpCall.stepName, cost: 0, usage: 'unknown type', warning: 'unknown type' };
  }
}

function findModelPricing(
  model: string,
  models: Record<string, ModelPricing>
): { pricing: ModelPricing | undefined; matchedKey: string | undefined } {
  if ( models[model] ) {
    return { pricing: models[model], matchedKey: model };
  }
  const prefixMatch = Object.entries( models ).find( ( [ key ] ) => model.startsWith( key ) );
  return prefixMatch ?
    { pricing: prefixMatch[1], matchedKey: prefixMatch[0] } :
    { pricing: undefined, matchedKey: undefined };
}

function aggregateLLMCosts(
  llmCalls: LLMCall[],
  config: PricingConfig
): {
  results: LLMCostResult[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  llmTotalCost: number;
  unknownModels: string[];
} {
  const unknownModels = new Set<string>();
  const results: LLMCostResult[] = [];
  const totals = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, cost: 0 };

  for ( const call of llmCalls ) {
    const { pricing, matchedKey } = findModelPricing( call.model, config.models ?? {} );
    const { cost, warning } = calculateLLMCallCost( call.usage, pricing );

    const prefixWarning = ( pricing && matchedKey !== call.model ) ?
      `priced as ${matchedKey}` :
      undefined;

    if ( !pricing ) {
      unknownModels.add( call.model );
    }

    results.push( {
      step: call.stepName,
      model: call.model,
      input: call.usage.inputTokens ?? 0,
      output: call.usage.outputTokens ?? 0,
      cached: call.usage.cachedInputTokens ?? 0,
      reasoning: call.usage.reasoningTokens ?? 0,
      cost,
      warning: warning ?? prefixWarning
    } );

    totals.inputTokens += call.usage.inputTokens ?? 0;
    totals.outputTokens += call.usage.outputTokens ?? 0;
    totals.cachedTokens += call.usage.cachedInputTokens ?? 0;
    totals.reasoningTokens += call.usage.reasoningTokens ?? 0;
    totals.cost += cost;
  }

  return {
    results,
    totalInputTokens: totals.inputTokens,
    totalOutputTokens: totals.outputTokens,
    totalCachedTokens: totals.cachedTokens,
    totalReasoningTokens: totals.reasoningTokens,
    llmTotalCost: totals.cost,
    unknownModels: [ ...unknownModels ]
  };
}

export function calculateCost( trace: TraceNode, config: PricingConfig, traceFile = '' ): CostReport {
  const llmCalls = findLLMCalls( trace );
  const httpCalls = findHTTPCalls( trace );
  const serviceResults: Record<string, ServiceCostSummary> = {};

  for ( const call of httpCalls ) {
    if ( call.status && call.status >= 400 ) {
      continue;
    }

    const serviceInfo = identifyService( call, config.services );
    if ( !serviceInfo ) {
      continue;
    }

    if ( serviceInfo.config.type === 'response_cost' ) {
      const hasCostData = extractValue( call, serviceInfo.config.cost_path! );
      const isBillableMethod = serviceInfo.config.billable_method &&
        call.method === serviceInfo.config.billable_method;

      if ( !hasCostData && !isBillableMethod ) {
        continue;
      }
    }

    const result = calculateServiceCost( call, serviceInfo );

    if ( !serviceResults[serviceInfo.serviceName] ) {
      serviceResults[serviceInfo.serviceName] = {
        serviceName: serviceInfo.serviceName,
        calls: [],
        totalCost: 0
      };
    }

    serviceResults[serviceInfo.serviceName].calls.push( result );
    serviceResults[serviceInfo.serviceName].totalCost += result.cost;
  }

  const {
    results: llmResults,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalReasoningTokens,
    llmTotalCost,
    unknownModels
  } = aggregateLLMCosts( llmCalls, config );

  const serviceTotalCost = Object.values( serviceResults ).reduce(
    ( sum, s ) => sum + s.totalCost, 0
  );
  const totalCost = llmTotalCost + serviceTotalCost;

  const durationMs =
    trace.endedAt && trace.startedAt ? trace.endedAt - trace.startedAt : null;

  return {
    traceFile,
    workflowName: trace.name || 'unknown',
    durationMs,

    llmCalls: llmResults,
    llmTotalCost,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalReasoningTokens,
    unknownModels,

    services: Object.values( serviceResults ),
    serviceTotalCost,

    totalCost
  };
}
