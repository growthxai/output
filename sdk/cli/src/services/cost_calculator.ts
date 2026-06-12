import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

import type {
  TraceNode,
  LLMCall,
  HTTPCall,
  TokenUsage,
  LLMUsageLine,
  PricingConfig,
  ModelPricing,
  ServiceConfig,
  LLMCostResult,
  ServiceCostResult,
  HTTPCostResult,
  HostCostSummary,
  CostReport
} from '#types/cost.js';

const ARRAY_ACCESS_PATTERN = /^(\w+)\[(\d+)\]$/;

function tokenCost( tokens: number, pricePerMillion: number ): number {
  return ( tokens / 1_000_000 ) * pricePerMillion;
}

function hostFromUrl( url: string ): string {
  if ( !url ) {
    return 'unknown';
  }
  return url.replace( /^https?:\/\//, '' ).split( '/' )[0] || 'unknown';
}

function lineRate( type: string, pricing: ModelPricing ): number | undefined {
  const rates: Record<string, number> = {
    input: pricing.input ?? 0,
    input_cached: pricing.cached_input ?? 0,
    output: pricing.output ?? 0,
    reasoning: pricing.reasoning ?? pricing.output ?? 0
  };
  return rates[type];
}

// Re-prices the event's usage lines at costs.yml rates. A line type without a
// configured mapping degrades to its as-charged total rather than $0, so new
// producer line types never silently vanish from the adjusted figure.
function priceLines( lines: LLMUsageLine[], pricing: ModelPricing ): number {
  return lines.reduce( ( sum, line ) => {
    const rate = lineRate( line.type, pricing );
    return sum + ( rate === undefined ? line.total : tokenCost( line.amount, rate ) );
  }, 0 );
}

// Token counts for display. The producer's 'input' line excludes cached tokens
// (sdk/llm emits input − cached), while AI SDK / legacy output.usage report
// inputTokens as the total — add cached back so both trace formats show
// comparable columns.
function eventTokenUsage( lines: LLMUsageLine[] ): TokenUsage {
  const sumOf = ( type: string ): number =>
    lines.filter( l => l.type === type ).reduce( ( s, l ) => s + l.amount, 0 );
  const cached = sumOf( 'input_cached' );
  return {
    inputTokens: sumOf( 'input' ) + cached,
    cachedInputTokens: cached,
    outputTokens: sumOf( 'output' ),
    reasoningTokens: sumOf( 'reasoning' )
  };
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

  if ( !bundled ) {
    console.warn( 'Warning: bundled pricing config is empty or missing. Add a config/costs.yml to your project to define model pricing.' );
    return { models: {}, services: {} };
  }

  const projectPath = join( process.cwd(), 'config', 'costs.yml' );
  if ( !configPath && existsSync( projectPath ) ) {
    const project = loadYaml( projectPath );
    return {
      models: { ...bundled.models, ...( project?.models ?? {} ) },
      services: { ...bundled.services, ...( project?.services ?? {} ) }
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
    n => n.kind === 'llm' && ( !!n.attributes?.['llm:usage'] || !!n.output?.usage ),
    ( n, stepName ) => {
      // Prefer the recorded llm:usage event — it carries the as-charged cost
      // and the per-token-type amounts directly.
      const event = n.attributes?.['llm:usage'];
      if ( event ) {
        return {
          stepName: stepName || n.name || 'unknown',
          llmName: n.name || 'llm',
          model: event.modelId || 'unknown',
          usage: eventTokenUsage( event.usage ?? [] ),
          originalCost: event.total,
          lines: event.usage ?? []
        };
      }

      // Legacy traces (no llm:usage event): derive from output.usage and let the
      // costs.yml-derived cost stand in as the original.
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
    ( n, stepName ) => {
      const costEvent = n.attributes?.['http:request:cost'];
      const url = costEvent?.url || ( n.input?.url as string ) || '';
      return {
        stepName: stepName || 'unknown',
        url,
        method: ( n.input?.method as string ) || 'GET',
        input: ( n.input as Record<string, unknown> ) || {},
        output: ( n.output as Record<string, unknown> ) || {},
        status: n.output?.status as number | undefined,
        host: hostFromUrl( url ),
        originalCost: costEvent?.total,
        requestId: costEvent?.requestId ||
          ( typeof n.id === 'string' ? n.id : undefined )
      };
    },
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

  // AI SDK inputTokens includes cached tokens — charge the cached portion at
  // the cached rate only (matches how sdk/llm prices the same call).
  const cachedTokens = usage.cachedInputTokens ?? 0;
  const nonCachedTokens = Math.max( 0, ( usage.inputTokens ?? 0 ) - cachedTokens );

  const inputCost = tokenCost( nonCachedTokens, modelPricing.input ?? 0 );
  const outputCost = tokenCost( usage.outputTokens ?? 0, modelPricing.output ?? 0 );
  const cachedCost = tokenCost( cachedTokens, modelPricing.cached_input ?? 0 );
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
    return {
      step: httpCall.stepName, cost: 0, usage: 'no usage data',
      kind: 'failed', warning: 'no usage data'
    };
  }

  const usage = extractValue( httpCall.output, config.usage_path );

  if ( config.input_field && config.output_field ) {
    const usageObj = usage as Record<string, number> | undefined;
    if ( !usageObj ) {
      return {
        step: httpCall.stepName, cost: 0, usage: 'no usage data',
        kind: 'failed', warning: 'no usage data'
      };
    }
    const inputTokens = usageObj[config.input_field] ?? 0;
    const outputTokens = usageObj[config.output_field] ?? 0;
    const inputCost = tokenCost( inputTokens, config.input_per_million ?? 0 );
    const outputCost = tokenCost( outputTokens, config.output_per_million ?? 0 );
    return {
      step: httpCall.stepName,
      cost: inputCost + outputCost,
      usage: `${( inputTokens + outputTokens ).toLocaleString( 'en-US' )} tokens`,
      kind: 'computed'
    };
  }

  const tokens = typeof usage === 'number' ? usage : 0;
  if ( tokens === 0 ) {
    return {
      step: httpCall.stepName, cost: 0, usage: 'no usage data',
      kind: 'failed', warning: 'no usage data'
    };
  }

  const cost = tokenCost( tokens, config.per_million ?? 0 );
  return {
    step: httpCall.stepName,
    cost,
    usage: `${tokens.toLocaleString( 'en-US' )} tokens`,
    kind: 'computed'
  };
}

// units: undefined means the call couldn't be measured (no endpoint match, or
// a units_per_line endpoint without a string body) — distinct from a measured 0.
function resolveUnitEndpoint(
  url: string,
  httpCall: HTTPCall,
  config: ServiceConfig
): { units: number | undefined; endpoint: string } {
  if ( !config.endpoints ) {
    return { units: undefined, endpoint: 'unknown' };
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

    return { units: undefined, endpoint: endpointName };
  }

  return { units: undefined, endpoint: 'unknown' };
}

function calculateUnitServiceCost(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  const { units, endpoint } = resolveUnitEndpoint( httpCall.url, httpCall, config );
  if ( units === undefined ) {
    return {
      step: httpCall.stepName, cost: 0, usage: '0 units',
      kind: 'failed', warning: 'unknown endpoint', endpoint
    };
  }

  const cost = units * ( config.price_per_unit || 0 );
  return {
    step: httpCall.stepName,
    cost,
    usage: `${units.toLocaleString( 'en-US' )} units`,
    kind: 'computed',
    endpoint
  };
}

function calculateRequestServiceCost(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  if ( config.models && config.model_path ) {
    const model = extractValue( httpCall.input, config.model_path ) as string | undefined;
    // ?? rather than || so a configured price of 0 (free tier) is honored.
    const price = ( model !== undefined ? config.models[model] : undefined ) ??
      config.default_price;
    if ( price === undefined ) {
      return {
        step: httpCall.stepName, cost: 0, usage: '1 request',
        kind: 'failed', warning: 'unknown model price', model
      };
    }
    return { step: httpCall.stepName, cost: price, usage: '1 request', kind: 'computed', model };
  }

  if ( config.endpoints ) {
    for ( const [ endpointName, endpointConfig ] of Object.entries( config.endpoints ) ) {
      if ( httpCall.url.includes( endpointConfig.pattern ) ) {
        if ( endpointConfig.price !== undefined ) {
          return {
            step: httpCall.stepName,
            cost: endpointConfig.price,
            usage: '1 request',
            kind: 'computed',
            endpoint: endpointName
          };
        }
        if ( endpointConfig.price_per_item && endpointConfig.items_path ) {
          const items = extractValue( httpCall.input, endpointConfig.items_path );
          // Missing/un-captured request body is not the same as zero items —
          // only a real array is a measured count.
          if ( !Array.isArray( items ) ) {
            return {
              step: httpCall.stepName, cost: 0, usage: 'items not captured',
              kind: 'failed', warning: 'items not captured', endpoint: endpointName
            };
          }
          return {
            step: httpCall.stepName,
            cost: items.length * endpointConfig.price_per_item,
            usage: `${items.length} items`,
            kind: 'computed',
            endpoint: endpointName
          };
        }
      }
    }
  }

  return {
    step: httpCall.stepName, cost: 0, usage: 'unknown endpoint',
    kind: 'failed', warning: 'unknown endpoint'
  };
}

function calculateResponseCostService(
  httpCall: HTTPCall,
  config: ServiceConfig
): ServiceCostResult {
  const cost = extractValue( httpCall, config.cost_path! ) as number | undefined;

  // A provider-reported cost — including a legitimate $0 — is an exact figure.
  if ( typeof cost === 'number' ) {
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
      kind: 'computed',
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
    if ( fallbackPrice !== undefined ) {
      return {
        step: httpCall.stepName,
        cost: fallbackPrice,
        usage: '1 request (estimated)',
        kind: 'estimated',
        model,
        warning: 'using fallback estimate'
      };
    }

    if ( config.default_fallback !== undefined ) {
      return {
        step: httpCall.stepName,
        cost: config.default_fallback,
        usage: '1 request (estimated)',
        kind: 'estimated',
        model: 'unknown',
        warning: 'using default estimate'
      };
    }
  }

  return {
    step: httpCall.stepName, cost: 0, usage: 'no cost data',
    kind: 'failed', warning: 'no cost data'
  };
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
      return {
        step: httpCall.stepName, cost: 0, usage: 'unknown type',
        kind: 'failed', warning: 'unknown type'
      };
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

function repriceCall( call: LLMCall, pricing: ModelPricing ): number {
  return call.lines ?
    priceLines( call.lines, pricing ) :
    calculateLLMCallCost( call.usage, pricing ).cost;
}

function llmNote(
  call: LLMCall,
  pricing: ModelPricing | undefined,
  matchedKey: string | undefined
): string | undefined {
  if ( !pricing ) {
    return call.originalCost !== undefined ? 'no costs.yml override' : 'unknown model';
  }
  return matchedKey !== call.model ? `priced as ${matchedKey}` : undefined;
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
  llmOriginalCost: number;
  llmAdjustedCost: number;
  unconfiguredModels: string[];
} {
  const unconfiguredModels = new Set<string>();
  const results: LLMCostResult[] = [];
  const totals = {
    inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0,
    originalCost: 0, adjustedCost: 0
  };

  for ( const call of llmCalls ) {
    const { pricing, matchedKey } = findModelPricing( call.model, config.models ?? {} );

    // costs.yml override (the "adjusted" cost) — re-price the event's usage
    // lines at configured rates (or the legacy token counts when no event).
    // Undefined when the model isn't in costs.yml.
    const repriced = pricing ? repriceCall( call, pricing ) : undefined;

    // Original = as-charged from the trace event; fall back to the repriced cost
    // for legacy traces with no event.
    const originalCost = call.originalCost ?? repriced ?? 0;
    const adjustedCost = repriced ?? originalCost;

    if ( !pricing ) {
      unconfiguredModels.add( call.model );
    }
    const note = llmNote( call, pricing, matchedKey );

    results.push( {
      step: call.stepName,
      model: call.model,
      input: call.usage.inputTokens ?? 0,
      output: call.usage.outputTokens ?? 0,
      cached: call.usage.cachedInputTokens ?? 0,
      reasoning: call.usage.reasoningTokens ?? 0,
      originalCost,
      adjustedCost,
      note
    } );

    totals.inputTokens += call.usage.inputTokens ?? 0;
    totals.outputTokens += call.usage.outputTokens ?? 0;
    totals.cachedTokens += call.usage.cachedInputTokens ?? 0;
    totals.reasoningTokens += call.usage.reasoningTokens ?? 0;
    totals.originalCost += originalCost;
    totals.adjustedCost += adjustedCost;
  }

  return {
    results,
    totalInputTokens: totals.inputTokens,
    totalOutputTokens: totals.outputTokens,
    totalCachedTokens: totals.cachedTokens,
    totalReasoningTokens: totals.reasoningTokens,
    llmOriginalCost: totals.originalCost,
    llmAdjustedCost: totals.adjustedCost,
    unconfiguredModels: [ ...unconfiguredModels ]
  };
}

function pushHTTPResult(
  acc: Record<string, HostCostSummary>,
  result: HTTPCostResult
): void {
  if ( !acc[result.host] ) {
    acc[result.host] = {
      host: result.host, calls: [], originalTotalCost: 0, adjustedTotalCost: 0
    };
  }
  acc[result.host].calls.push( result );
  acc[result.host].originalTotalCost += result.originalCost;
  acc[result.host].adjustedTotalCost += result.adjustedCost;
}

// For an event-bearing (billable) request, decide the adjusted cost: apply the
// costs.yml recompute only when it produced an exact figure ('computed' —
// which includes a legitimate $0). Estimates and failed recomputes never
// replace the as-charged cost, and an errored response can't be re-priced
// from service rules even though its event proves it was charged.
function resolveHTTPOverride(
  call: HTTPCall,
  serviceInfo: { serviceName: string; config: ServiceConfig } | null,
  originalCost: number
): { adjustedCost: number; usage: string; note?: string } {
  if ( !serviceInfo ) {
    return { adjustedCost: originalCost, usage: 'as-charged' };
  }

  if ( call.status && call.status >= 400 ) {
    return {
      adjustedCost: originalCost,
      usage: 'as-charged',
      note: 'request errored; using as-charged'
    };
  }

  const recompute = calculateServiceCost( call, serviceInfo );
  if ( recompute.kind === 'computed' ) {
    return { adjustedCost: recompute.cost, usage: recompute.usage };
  }

  return {
    adjustedCost: originalCost,
    usage: 'as-charged',
    note: 'no usable costs.yml override; using as-charged'
  };
}

// Each call is priced by the best evidence it carries: an http:request:cost
// event is proof of a charge (counted regardless of HTTP status), while
// eventless calls fall back to costs.yml service rules — so a mixed trace
// (instrumented and uninstrumented clients) loses neither.
// Known edge: an eventless node whose body carries cost data (e.g. exa
// costDollars) is priced by the legacy path even in an event-bearing trace;
// addRequestCost binds events to the node carrying the cost data, so this
// does not double-count in practice.
function aggregateHTTPCosts(
  httpCalls: HTTPCall[],
  config: PricingConfig
): Record<string, HostCostSummary> {
  const hosts: Record<string, HostCostSummary> = {};

  for ( const call of httpCalls ) {
    if ( call.originalCost !== undefined ) {
      const serviceInfo = identifyService( call, config.services );
      const { adjustedCost, usage, note } =
        resolveHTTPOverride( call, serviceInfo, call.originalCost );

      pushHTTPResult( hosts, {
        step: call.stepName,
        host: call.host,
        usage,
        originalCost: call.originalCost,
        adjustedCost,
        note
      } );
      continue;
    }

    // Legacy path — no cost event on this call; price from costs.yml rules.
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

    const recompute = calculateServiceCost( call, serviceInfo );
    pushHTTPResult( hosts, {
      step: call.stepName,
      host: call.host,
      usage: recompute.usage,
      originalCost: recompute.cost,
      adjustedCost: recompute.cost,
      note: recompute.warning
    } );
  }

  return hosts;
}

export function calculateCost( trace: TraceNode, config: PricingConfig, traceFile = '' ): CostReport {
  const llmCalls = findLLMCalls( trace );
  const httpCalls = findHTTPCalls( trace );

  const {
    results: llmResults,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalReasoningTokens,
    llmOriginalCost,
    llmAdjustedCost,
    unconfiguredModels
  } = aggregateLLMCosts( llmCalls, config );

  const httpCosts = Object.values( aggregateHTTPCosts( httpCalls, config ) );
  const httpOriginalCost = httpCosts.reduce( ( sum, h ) => sum + h.originalTotalCost, 0 );
  const httpAdjustedCost = httpCosts.reduce( ( sum, h ) => sum + h.adjustedTotalCost, 0 );

  const originalTotalCost = llmOriginalCost + httpOriginalCost;
  const adjustedTotalCost = llmAdjustedCost + httpAdjustedCost;

  const durationMs =
    trace.endedAt && trace.startedAt ? trace.endedAt - trace.startedAt : null;

  return {
    traceFile,
    workflowName: trace.name || 'unknown',
    durationMs,

    llmCalls: llmResults,
    llmOriginalCost,
    llmAdjustedCost,
    totalInputTokens,
    totalOutputTokens,
    totalCachedTokens,
    totalReasoningTokens,
    unconfiguredModels,

    httpCosts,
    httpOriginalCost,
    httpAdjustedCost,

    originalTotalCost,
    adjustedTotalCost,
    totalCost: adjustedTotalCost
  };
}
