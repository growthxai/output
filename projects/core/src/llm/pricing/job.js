import { CancelableRunner } from '#helpers/cancelable_runner';
import { update as updateCache } from './cache.js';
import { Logger } from '#runtime_logger';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { parseModelsDevData } from './parser.js';
import { sleepCancellable } from '#helpers/promise';

const log = Logger.createLogger( 'LLM Pricing Retriever' );

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

const DATA_SOURCE_URL = 'https://models.dev/api.json';
const INTERVAL_AFTER_SUCCESS = 6 * 60 * 60 * 1000; // 6 hours
const INTERVAL_AFTER_ERROR = 5 * 60 * 1000; // 5 minutes

const fetchData = async signal => {
  try {
    const response = await fetch( DATA_SOURCE_URL, { dispatcher, signal } );
    if ( !response.ok ) {
      log.warn( 'Request error', { status: response.status } );
      return null;
    }

    return await response.json();

  } catch ( error ) {
    if ( !signal.aborted ) {
      log.warn( 'Request failure', { error: error.message, code: error.code } );
    }
    return null;
  }
};

const refreshCache = async signal => {
  const rawJson = await fetchData( signal );
  if ( !rawJson ) {
    return false;
  }

  try {
    updateCache( parseModelsDevData( rawJson ) );
    log.info( 'Data acquired' );
    return true;
  } catch ( error ) {
    log.warn( 'Parsing failure', { error: error.message } );
    return false;
  }
};

/**
 * Periodically fetches models pricing from models.dev, parses it and saves to the cache.
 */
export class LLMPricingRetriever extends CancelableRunner {
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
      const success = await refreshCache( signal );
      await sleepCancellable( success ? this.#intervalAfterSuccess : this.#intervalAfterError, signal );
    }
  }
};
