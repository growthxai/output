/** Supported message roles */
export const Role = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant'
};

export const CacheFreshness = Object.freeze( {
  CACHED: 'cached',
  STALE: 'stale',
  SNAPSHOT: 'snapshot'
} );

/** Where an LLM generation cost total came from */
export const PricingSource = Object.freeze( {
  MODELS_DEV: 'models.dev',
  PROVIDER: 'provider'
} );

