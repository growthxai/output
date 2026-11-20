import { CancelableRunner } from '#helpers/cancelable_runner';
import { update as updateCache } from './cache.js';
import { Logger } from '#runtime_logger';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { parseModelsDevData } from './parser.js';
import { sleepCancellable } from '#helpers/promise';

const log = Logger.createLogger( 'LLM' );

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

const DATA_SOURCE_URL = 'https://models.dev/api.json';
const INTERVAL_AFTER_SUCCESS = 6 * 60 * 60 * 1000; // 6 hours
const INTERVAL_AFTER_ERROR = 5 * 60 * 1000; // 5 minutes

const fetchData = async signal => {
  const state = { res: null };
  try {
    state.res = await fetch( DATA_SOURCE_URL, { dispatcher, signal } );
  } catch ( error ) {
    if ( !signal.aborted ) {
      log.error( 'Request failure', { error: error.message, code: error.code } );
    }
    return false;
  }

  if ( !state.res.ok ) {
    log.error( 'Request error', { status: state.res.status } );
    return false;
  }

  try {
    const json = await state.res.json();
    updateCache( parseModelsDevData( json ) );
    log.info( 'Data acquired' );

    return true;
  } catch ( error ) {
    log.error( 'Parsing failure', { error: error.message } );
    return false;
  }
};

/**
 * Periodically fetches models pricing from models.dev, parses it and saves to the cache.
 */
export class LLMPricingDataRetriever extends CancelableRunner {
  #intervalAfterSuccess = INTERVAL_AFTER_SUCCESS;
  #intervalAfterError = INTERVAL_AFTER_ERROR;

  /**
   * @param {object} options
   * @param {AbortSignal} options.signal - stops the retriever when aborted
   * @param {object} [options.overrides] - interval tuning, mostly for tests
   */
  constructor( { signal, overrides = {} } ) {
    super( { signal } );
    if ( Number.isFinite( overrides?.intervalAfterSuccess ) ) {
      this.#intervalAfterSuccess = overrides.intervalAfterSuccess;
    }
    if ( Number.isFinite( overrides?.intervalAfterError ) ) {
      this.#intervalAfterError = overrides.intervalAfterError;
    }
  }

  /**
   * @inheritdoc
   * @param {AbortSignal} signal
   */
  async run( signal ) {
    while ( !signal.aborted ) {
      const success = await fetchData( signal );

      await sleepCancellable( success ? this.#intervalAfterSuccess : this.#intervalAfterError, signal );
    }
  }
};
