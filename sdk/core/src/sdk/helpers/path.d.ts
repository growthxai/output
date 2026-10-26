/**
 * Tools to interact with filesystem paths
 *
 * @deprecated Internal helper with no public replacement, kept only for `@outputai/evals`. It will be removed when evals folds into `@outputai/core`.
 */
export declare const Path: {
  /**
   * Return the first immediate directory of the file invoking the code that called this function.
   *
   * Excludes `@outputai/core`, node, other internal paths, and any additional ignore paths.
   */
  resolveInvocationDir( additionalIgnorePaths?: string[] ): string
};
