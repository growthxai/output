import ky from 'ky';
import { outputFetch } from '../fetch/index.js';

/**
 * Creates a ky client that uses `outputFetch`.
 *
 * @param {import('ky').Options} options - The ky options to extend the base client.
 * @returns {import('ky').KyInstance} A ky instance extended with Output.ai tracing hooks.
 */
export const createKyClient = ( options = {} ) => ky.create( { fetch: outputFetch, ...options } );
