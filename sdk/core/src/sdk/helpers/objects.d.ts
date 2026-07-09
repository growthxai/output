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
   * Creates a new object by merging object `b` onto object `a`, biased toward `b`:
   * - Fields in `b` that don't exist in `a` are created.
   * - Fields in `a` that don't exist in `b` are left unchanged.
   * - Fields in `a` and `b` are passed as arguments to the resolve function (a,b) and its return assigns the new value.
   *
   * @param a - The base object.
   * @param b - The overriding object.
   * @param resolver - The resolver function.
   * @throws {Error} If either `a` or `b` is not a plain object.
   * @returns A new merged object.
   */
  deepMergeWithResolver( a: object, b: object | null | undefined, resolver: ( a: unknown, b: unknown ) => unknown ): object
};
