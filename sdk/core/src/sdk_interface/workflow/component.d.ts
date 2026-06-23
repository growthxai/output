/**
 * Attributes
 */
export type Attribute = {
  name: string,
  type: string,
  description?: string,
  inputSchema?: object,
  outputSchema?: object,
  options?: object
};

/**
 * Extract attributes from a Outputai component
 * @param fn
 * @returns
 */
export declare function readAttributes( fn: Function ): Attribute | undefined;

/**
 * Check if a function is an Outputai component
 * @param fn
 */
export declare function isComponent( fn: Function ): boolean;
