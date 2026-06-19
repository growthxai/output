/**
 * Return the first immediate directory of the file invoking the code that called this function.
 *
 * Excludes `@outputai/core`, node, and other internal paths.
 */
export function resolveInvocationDir(): string;
