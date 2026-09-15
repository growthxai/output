import { parseLLMUsage } from './usage.js';
import { calculateCosts } from './cost.js';
import { Tracing, Event } from '@outputai/core/sdk/runtime';
import { Logger } from '@outputai/core';
import { convertCostToLegacy } from './legacy_cost_attribute.js';

/**
 * Collects the usage of a single LLM call and bills it once.
 *
 * Steps and the response are recorded as the SDK lifecycle reports them, so a call that throws
 * after the model ran is still billed for what it spent. `bill()` parses the usage, costs it,
 * attaches both as trace attributes and emits the metering events; it never throws.
 */
export class Metering {
  #response = null;
  #recordedSteps = [];
  #billed = false;
  #prompt;
  #traceId;
  #attributes = {
    usage: null,
    cost: null,
    legacy: null
  };

  async #createAttributes( { usage, steps } ) {
    this.#attributes.usage = parseLLMUsage( { prompt: this.#prompt, usage, steps } );
    if ( this.#attributes.usage ) {
      this.#attributes.cost = await calculateCosts( this.#attributes.usage );
      if ( this.#attributes.cost ) {
        // @TEMP Preserve the deprecated event and trace attribute for legacy consumers.
        this.#attributes.legacy = convertCostToLegacy( this.#attributes.cost );
      }
    }
  }

  #attachAttributes() {
    if ( this.#attributes.usage ) {
      Tracing.addEventAttribute( { eventId: this.#traceId, attribute: this.#attributes.usage } );
    }
    if ( this.#attributes.cost ) {
      Tracing.addEventAttribute( { eventId: this.#traceId, attribute: this.#attributes.cost } );
    }
    if ( this.#attributes.legacy ) {
      Tracing.addEventAttribute( { eventId: this.#traceId, attribute: this.#attributes.legacy } );
    }
  }

  #emitEvents() {
    if ( this.#attributes.usage ) {
      Event.emit( 'llm:generation:metering', structuredClone( { cost: this.#attributes.cost, usage: this.#attributes.usage } ) );
    }
    if ( this.#attributes.legacy ) {
      Event.emit( 'cost:llm:request', structuredClone( this.#attributes.legacy ) );
    }
  }

  /**
   * @param {object} args
   * @param {string} args.traceId - Trace event the usage and cost attributes are attached to
   * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
   */
  constructor( { traceId, prompt } ) {
    this.#traceId = traceId;
    this.#prompt = prompt;
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
   * Records the final response, whose aggregate usage and steps take precedence when billing.
   *
   * @param {object} response - AI SDK response
   */
  recordResponse = response => {
    if ( !this.#billed ) {
      this.#response = response;
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
   * @returns {Promise<void>}
   */
  bill = async () => {
    if ( this.#billed ) {
      return;
    }

    const responseSteps = this.#response?.steps;
    const steps = Array.isArray( responseSteps ) && responseSteps.length > 0 ? responseSteps : this.#recordedSteps;
    const usage = this.#response?.usage;

    if ( !usage && steps.length === 0 ) {
      return;
    }

    this.#billed = true;

    try {
      await this.#createAttributes( { usage, steps } );
      this.#attachAttributes();
      this.#emitEvents();

    } catch ( error ) {
      Logger.error( 'Metering failed', { namespace: 'LLM', error: error?.message ?? String( error ) } );
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
