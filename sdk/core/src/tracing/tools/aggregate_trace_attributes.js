/**
 * Aggregate `attributes.cost` and `attributes.token_usage` across an entire trace tree.
 *
 * Walks every node in the tree, sums `attributes.cost.total` grouped by the emitting
 * event name (inferred from node `kind` — see `eventNameForKind`), and sums
 * `attributes.token_usage` across LLM nodes. Falls back to `output.usage` on
 * legacy llm trace nodes that predate the `attributes.token_usage` write
 * (see overview §1.2).
 *
 * @typedef {object} TraceAttributes
 * @property {{ total: number, components: Array<{ name: string, value: number }> }} cost
 * @property {{ inputTokens: number, outputTokens: number, cachedInputTokens: number, totalTokens: number }} tokenUsage
 */

const COST_EVENT_LLM = 'cost:llm:request';
const COST_EVENT_HTTP = 'cost:http:request';
const COST_EVENT_OTHER = 'other';

/**
 * Map a trace node `kind` to the canonical cost event name that would emit it.
 * Unknown kinds bucket into `other` so future event sources still roll up cleanly.
 *
 * @param {string} kind
 * @returns {string}
 */
const eventNameForKind = kind => {
  if ( kind === 'llm' ) {
    return COST_EVENT_LLM;
  }
  if ( kind === 'http' ) {
    return COST_EVENT_HTTP;
  }
  return COST_EVENT_OTHER;
};

const isNumber = value => typeof value === 'number' && Number.isFinite( value );

/**
 * Pull token usage off an llm node, preferring the new attribute over the legacy
 * `output.usage` fallback. Returns `null` when neither shape is present.
 */
const readTokenUsage = node => {
  const attrUsage = node.attributes?.token_usage;
  if ( attrUsage && typeof attrUsage === 'object' ) {
    return attrUsage;
  }
  const legacyUsage = node.output?.usage;
  if ( legacyUsage && typeof legacyUsage === 'object' ) {
    return legacyUsage;
  }
  return null;
};

/**
 * Recursively walk a trace tree depth-first, applying `visit` to each node.
 */
const walk = ( node, visit ) => {
  if ( !node ) {
    return;
  }
  visit( node );
  for ( const child of node.children ?? [] ) {
    walk( child, visit );
  }
};

/**
 * Build the aggregated `attributes` payload returned by `/trace-attributes`.
 * Component buckets always appear in a stable order so callers can index them
 * positionally if they want to.
 *
 * @param {object|null} root - The root NodeEntry returned by `buildTraceTree`.
 * @returns {TraceAttributes}
 */
export default function aggregateTraceAttributes( root ) {
  const costByEvent = new Map( [
    [ COST_EVENT_LLM, 0 ],
    [ COST_EVENT_HTTP, 0 ],
    [ COST_EVENT_OTHER, 0 ]
  ] );
  const tokenUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 };

  walk( root, node => {
    const cost = node.attributes?.cost;
    if ( cost && isNumber( cost.total ) ) {
      const eventName = eventNameForKind( node.kind );
      costByEvent.set( eventName, ( costByEvent.get( eventName ) ?? 0 ) + cost.total );
    }

    if ( node.kind === 'llm' ) {
      const usage = readTokenUsage( node );
      if ( usage ) {
        if ( isNumber( usage.inputTokens ) ) {
          tokenUsage.inputTokens += usage.inputTokens;
        }
        if ( isNumber( usage.outputTokens ) ) {
          tokenUsage.outputTokens += usage.outputTokens;
        }
        if ( isNumber( usage.cachedInputTokens ) ) {
          tokenUsage.cachedInputTokens += usage.cachedInputTokens;
        }
        if ( isNumber( usage.totalTokens ) ) {
          tokenUsage.totalTokens += usage.totalTokens;
        }
      }
    }
  } );

  const components = Array.from( costByEvent, ( [ name, value ] ) => ( { name, value } ) );
  const total = components.reduce( ( sum, { value } ) => sum + value, 0 );

  return {
    cost: { total, components },
    tokenUsage
  };
}

export { COST_EVENT_LLM, COST_EVENT_HTTP, COST_EVENT_OTHER };
