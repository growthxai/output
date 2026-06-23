/**
 * Attributes
 */
export type Attribute = {
  name: string,
  inputSchema?: object,
  outputSchema?: object,
  type: string,
  options: object
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
