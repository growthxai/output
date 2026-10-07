import type { KyInstance, Options } from 'ky';

/**
 * Creates a ky client.
 *
 * This client uses a custom fetch that introduces hooks to integrate with Output.ai tracing.
 *
 * @example
 * ```ts
 * import { createKyClient } from '@outputai/core/http';
 *
 * const client = createKyClient({
 *   prefix: 'https://api.example.com',
 *   timeout: 30000,
 *   retry: { limit: 3 }
 * });
 *
 * const response = await client.get('users/1');
 * const data = await response.json();
 * ```
 *
 * @param options - The ky options to extend the base client.
 * @returns A ky instance extended with Output.ai tracing hooks.
 */
export declare function createKyClient( options?: Options ): KyInstance;
