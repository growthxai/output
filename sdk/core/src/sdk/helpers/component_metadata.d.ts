/**
 * Tools to extract data from Outputai Core Components metadata storage
 */
export declare const ComponentMetadata: {
  /**
   * Extract the name from a workflow(), step() or evaluator() return
   * @param fn
   * @returns
   */
  getName( fn: Function ): string | undefined;

  /**
   * Check if a function has metadata from workflow(), step() or evaluator()
   * @param fn
   */
  has( fn: Function ): boolean;
};
