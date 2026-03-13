/**
 * Cost Calculator Types
 *
 * TypeScript interfaces for trace parsing, pricing configuration, and cost reports.
 */

// Trace Types

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
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
}

export interface LLMCall {
  stepName: string;
  llmName: string;
  model: string;
  usage: TokenUsage;
}

export interface HTTPCall {
  stepName: string;
  url: string;
  method: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status?: number;
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
  cost: number;
  warning?: string;
}

export interface ServiceCostResult {
  step: string;
  cost: number;
  usage: string;
  model?: string;
  endpoint?: string;
  warning?: string;
  details?: Record<string, unknown>;
}

export interface ServiceCostSummary {
  serviceName: string;
  calls: ServiceCostResult[];
  totalCost: number;
}

export interface CostReport {
  traceFile: string;
  workflowName: string;
  durationMs: number | null;

  llmCalls: LLMCostResult[];
  llmTotalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  unknownModels: string[];

  services: ServiceCostSummary[];
  serviceTotalCost: number;

  totalCost: number;
}

// Parsed cost data types (pre-computed for display)

export interface LLMModelSummary {
  model: string;
  count: number;
  cost: number;
}

export interface ServiceSummary {
  serviceName: string;
  callCount: number;
  cost: number;
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
  llmTotalCost: number;

  services: ServiceSummary[];
  serviceTotalCalls: number;
  serviceTotalCost: number;

  verbose: VerboseFlags;
  llmCalls: LLMCostResult[];
  serviceDetails: ServiceCostSummary[];

  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;

  totalCost: number;
  unknownModels: string[];
  isEmpty: boolean;
}

