/**
 * Cost Calculator Types
 *
 * TypeScript interfaces for trace parsing, pricing configuration, and cost reports.
 *
 * Costs are sourced from the trace events themselves (the as-charged "original"
 * cost), with `costs.yml` applied as an optional override layer (the "adjusted"
 * cost). Both figures are surfaced per model and per host.
 */

// Trace Types

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

// Cost events recorded on trace nodes (the as-charged ground truth)

export interface LLMUsageLine {
  type: string; // 'input' | 'input_cached' | 'output' | 'reasoning' | ...
  ppm: number;
  amount: number;
  total: number;
}

export interface LLMUsageEvent {
  type: 'llm:usage';
  modelId: string;
  usage: LLMUsageLine[];
  total: number;
  tokensUsed?: number;
}

export interface HTTPCostEvent {
  type: 'http:request:cost';
  url: string;
  requestId: string;
  total: number;
}

export interface HTTPCountEvent {
  type: 'http:request:count';
  url: string;
  requestId: string;
}

export interface NodeAttributes {
  'llm:usage'?: LLMUsageEvent;
  'http:request:cost'?: HTTPCostEvent;
  'http:request:count'?: HTTPCountEvent;
}

export interface TraceNode {
  id?: string;
  kind: string;
  name?: string;
  startedAt?: number;
  endedAt?: number;
  children?: TraceNode[];
  input?: Record<string, unknown>;
  output?: Record<string, unknown> & { usage?: TokenUsage };
  attributes?: NodeAttributes;
}

export interface LLMCall {
  stepName: string;
  llmName: string;
  model: string;
  usage: TokenUsage;
  // As-charged total from the trace event. Undefined for legacy traces that
  // predate llm:usage events, in which case the costs.yml-derived cost is used.
  originalCost?: number;
}

export interface HTTPCall {
  stepName: string;
  url: string;
  method: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status?: number;
  host: string;
  // As-charged total from the http:request:cost event. Undefined for nodes
  // without a cost event (e.g. count-only webhooks, polling requests).
  originalCost?: number;
  requestId?: string;
}

// Pricing Configuration Types

export interface ModelPricing {
  provider: string;
  input: number;
  output: number;
  cached_input?: number;
  reasoning?: number;
}

export interface EndpointConfig {
  pattern: string;
  units_per_request?: number;
  units_per_line?: number;
  price?: number;
  price_per_item?: number;
  items_path?: string;
}

export interface ServiceConfig {
  type: 'token' | 'unit' | 'request' | 'response_cost';
  url_pattern: string;

  // Token-based services
  usage_path?: string;
  per_million?: number;
  input_field?: string;
  output_field?: string;
  input_per_million?: number;
  output_per_million?: number;

  // Unit-based services
  price_per_unit?: number;
  endpoints?: Record<string, EndpointConfig>;

  // Request-based services
  model_path?: string;
  models?: Record<string, number>;
  default_price?: number;

  // Response-cost services
  cost_path?: string;
  billable_method?: string;
  fallback_models?: Record<string, number>;
  default_fallback?: number;
}

export interface PricingConfig {
  models: Record<string, ModelPricing>;
  services: Record<string, ServiceConfig>;
}

// Cost Calculation Result Types

export interface LLMCostResult {
  step: string;
  model: string;
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  // As-charged cost recorded in the trace.
  originalCost: number;
  // Cost after applying any costs.yml override (equals originalCost when no
  // override applies).
  adjustedCost: number;
  // e.g. 'priced as claude-opus-4', 'no costs.yml override', 'unknown model'.
  note?: string;
}

// Result of recomputing a single HTTP cost from costs.yml service rules.
export interface ServiceCostResult {
  step: string;
  cost: number;
  usage: string;
  model?: string;
  endpoint?: string;
  warning?: string;
  details?: Record<string, unknown>;
}

export interface HTTPCostResult {
  step: string;
  host: string;
  usage: string;
  originalCost: number;
  adjustedCost: number;
  note?: string;
}

export interface HostCostSummary {
  host: string;
  calls: HTTPCostResult[];
  originalTotalCost: number;
  adjustedTotalCost: number;
}

export interface CostReport {
  traceFile: string;
  workflowName: string;
  durationMs: number | null;

  llmCalls: LLMCostResult[];
  llmOriginalCost: number;
  llmAdjustedCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  // Models with no matching costs.yml entry; priced from the trace event only.
  unconfiguredModels: string[];

  httpCosts: HostCostSummary[];
  httpOriginalCost: number;
  httpAdjustedCost: number;

  originalTotalCost: number;
  adjustedTotalCost: number;
  // Headline figure (equals adjustedTotalCost).
  totalCost: number;
}

// Parsed cost data types (pre-computed for display)

export interface LLMModelSummary {
  model: string;
  count: number;
  originalCost: number;
  adjustedCost: number;
  note?: string;
}

export interface HostSummary {
  host: string;
  callCount: number;
  originalCost: number;
  adjustedCost: number;
}

export interface VerboseFlags {
  hasReasoning: boolean;
  hasCached: boolean;
}

export interface ParsedCostData {
  traceFile: string;
  workflowName: string;
  duration: string;

  llmModels: LLMModelSummary[];
  llmTotalCalls: number;
  llmOriginalCost: number;
  llmAdjustedCost: number;

  hosts: HostSummary[];
  httpTotalCalls: number;
  httpOriginalCost: number;
  httpAdjustedCost: number;

  verbose: VerboseFlags;
  llmCalls: LLMCostResult[];
  httpDetails: HostCostSummary[];

  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;

  originalTotalCost: number;
  adjustedTotalCost: number;
  unconfiguredModels: string[];
  isEmpty: boolean;
}
