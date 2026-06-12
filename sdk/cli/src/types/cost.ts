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

// Cost events recorded on trace nodes (the as-charged ground truth).
// The llm:usage shape is owned by the producer — import it rather than
// re-declaring, so the CLI can't silently drift from the wire format.

export type { LLMUsageEvent } from '@outputai/llm';
import type { LLMUsageEvent } from '@outputai/llm';

export type LLMUsageLine = LLMUsageEvent['usage'][number];

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
  output?: Record<string, unknown>;
  attributes?: NodeAttributes;
}

export interface LLMCall {
  stepName: string;
  llmName: string;
  model: string;
  usage: TokenUsage;
  // As-charged total from the llm:usage event.
  originalCost: number;
  // Priced usage lines from the llm:usage event.
  lines: LLMUsageLine[];
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
}

// Result of recomputing a single HTTP cost from costs.yml service rules.
// kind distinguishes a real price ('computed' — exact rates, including a
// legitimate $0) from a rough guess ('estimated' — fallback_models /
// default_fallback) and from a recompute that couldn't price the call
// ('failed'). Only 'computed' results may override an as-charged event cost.
export interface ServiceCostResult {
  step: string;
  cost: number;
  usage: string;
  kind: 'computed' | 'estimated' | 'failed';
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

  httpCosts: HostCostSummary[];
  httpOriginalCost: number;
  httpAdjustedCost: number;

  // As-charged total from the trace events.
  originalTotalCost: number;
  // Headline figure — the costs.yml-adjusted total.
  totalCost: number;
}

// Parsed cost data types (pre-computed for display)

export interface LLMModelSummary {
  model: string;
  count: number;
  originalCost: number;
  adjustedCost: number;
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
  totalCost: number;
  isEmpty: boolean;
}
