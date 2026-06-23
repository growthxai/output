/**
 * Return the first immediate directory of the file invoking the code that called this function.
 *
 * Excludes `@outputai/core`, node, other internal paths, and any additional ignore paths.
 */
export function resolveInvocationDir( additionalIgnorePaths?: string[] ): string;
