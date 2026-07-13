/** Tools to manipulate JS Objects */
export declare const Objects: {
  /**
   * Node safe clone implementation that doesn't use global structuredClone().
   *
   * Returns a cloned version of the object.
   *
   * Only clones static properties. Getters become static properties.
   *
   * @param object
   */
  clone( object: object ): object,

  /**
   * Returns true if the value is a plain object:
   * - `{}`
   * - `new Object()`
   * - `Object.create(null)`
   *
   * @param object - The value to check.
   * @returns Whether the value is a plain object.
   */
  isPlainObject( object: unknown ): boolean,

  /**
   * Creates a new object by recursively merging overlays onto a base object.
   * Later objects overwrite fields from earlier objects.
   *
   * Non-object overlays are ignored.
   *
   * @param base - The base object.
   * @param overlays - The overriding objects, applied from left to right.
   * @throws {Error} If `base` is not a plain object.
   * @returns A new merged object.
   */
  deepMerge( base: object, ...overlays: Array<object | null | undefined> ): object,

  /**
   * Creates a new object by recursively merging overlays onto a base object.
   * Existing leaf values are resolved by the resolver function.
   *
   * Non-object overlays are ignored.
   *
   * @param base - The base object.
   * @param args - The overriding objects, applied from left to right, followed by the resolver function.
   * @throws {Error} If `base` is not a plain object.
   * @returns A new merged object.
   */
  deepMergeWithResolver(
    base: object,
    ...args: [
      ...overlays: Array<object | null | undefined>,
      resolver: ( a: unknown, b: unknown ) => unknown
    ]
  ): object
};
