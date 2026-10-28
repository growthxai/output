import { parseLLMUsage } from './usage.js';
import { calculateCosts } from './cost.js';
import { stepEventBus } from '#bus';
import { addEventActionWithContext, EventAction } from '#tracing';
import { Logger } from '#runtime_logger';
import { convertCostToLegacy } from './legacy_cost_attribute.js';

/**
 * Collects the usage of a single LLM call and bills it once.
 *
 * Steps are recorded as the SDK lifecycle reports them, and the response is handed to `bill()` by
 * the paths that have one, so a call that throws after the model ran is still billed for what it
 * spent. `bill()` parses the usage, costs it, attaches both as trace attributes and emits the
 * metering events; it never throws.
 */
export class Metering {
  #recordedSteps = [];
  #billed = false;
  #prompt;
  #traceId;
  #toolIdsByName;
  #attributes = {
    usage: null,
    cost: null,
    legacy: null
  };

  async #createAttributes( { usage, steps } ) {
    const parseUsage = ( usageArg, usageSteps ) => parseLLMUsage( {
      prompt: this.#prompt,
      usage: usageArg,
      steps: usageSteps,
      toolIdsByName: this.#toolIdsByName
    } );
    this.#attributes.usage = parseUsage( usage, steps );
    if ( this.#attributes.usage ) {
      const requestUsages = steps.length > 1 ?
        steps.map( step => parseUsage( step.usage, [ step ] ) ) :
        [];
      this.#attributes.cost = requestUsages.length > 0 && requestUsages.every( Boolean ) ?
        await calculateCosts( this.#attributes.usage, requestUsages ) :
        await calculateCosts( this.#attributes.usage );
      if ( this.#attributes.cost ) {
        // @TEMP Preserve the deprecated event and trace attribute for legacy consumers.
        this.#attributes.legacy = convertCostToLegacy( this.#attributes.cost );
      }
    }
  }

  #attachAttributes() {
    if ( this.#attributes.usage ) {
      addEventActionWithContext( EventAction.ADD_ATTR, { id: this.#traceId, details: this.#attributes.usage } );
    }
    if ( this.#attributes.cost ) {
      addEventActionWithContext( EventAction.ADD_ATTR, { id: this.#traceId, details: this.#attributes.cost } );
    }
    if ( this.#attributes.legacy ) {
      addEventActionWithContext( EventAction.ADD_ATTR, { id: this.#traceId, details: this.#attributes.legacy } );
    }
  }

  #emitEvents() {
    if ( this.#attributes.usage ) {
      stepEventBus.emit( 'sdk:llm:generation:metering', structuredClone( { cost: this.#attributes.cost, usage: this.#attributes.usage } ) );
    }
    if ( this.#attributes.legacy ) {
      stepEventBus.emit( 'sdk:cost:llm:request', structuredClone( this.#attributes.legacy ) );
    }
  }

  /**
   * @param {object} args
   * @param {string} args.traceId - Trace event the usage and cost attributes are attached to
   * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
   * @param {Record<string, string>} [args.toolIdsByName] - Provider tool ids keyed by configured name
   */
  constructor( { traceId, prompt, toolIdsByName } ) {
    this.#traceId = traceId;
    this.#prompt = prompt;
    this.#toolIdsByName = toolIdsByName;
  }

  /**
   * Records a completed step, used as the usage source when the call ends without a response.
   *
   * @param {object} step - AI SDK step
   */
  recordStep = step => {
    if ( !this.#billed ) {
      this.#recordedSteps.push( step );
    }
  };

  /**
   * Bills the recorded usage: parses it, costs it, attaches the trace attributes and emits the
   * metering events. Later calls and later records are ignored, so it is safe to call from every
   * path that can end the call. Read the result from `attributes`.
   *
   * An empty collector is not a final answer: the SDK reports a stream error before the steps that
   * preceded it, so billing stays open until there is usage or a step to report.
   *
   * @param {object} [response] - AI SDK response, whose aggregate usage and steps take precedence
   *   over the recorded steps; omitted by the paths that end without one
   * @returns {Promise<void>}
   */
  bill = async ( response = null ) => {
    if ( this.#billed ) {
      return;
    }

    try {
      const responseSteps = response?.steps;
      const steps = Array.isArray( responseSteps ) && responseSteps.length > 0 ? responseSteps : this.#recordedSteps;
      const usage = response?.usage;

      if ( !usage && steps.length === 0 ) {
        return;
      }

      this.#billed = true;

      await this.#createAttributes( { usage, steps } );
      this.#attachAttributes();
      this.#emitEvents();

    } catch ( error ) {
      Logger.error( 'Metering failed', { namespace: 'LLM', error: error?.message || String( error ) } );
    }
  };

  /**
   * Attributes produced by `bill()`; each one is null until billed, and stays null when there is
   * nothing to report.
   *
   * @returns {{ usage: object|null, cost: object|null, legacy: object|null }}
   */
  get attributes() {
    return this.#attributes;
  }
}
