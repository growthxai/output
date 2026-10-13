/**
 * All attributes inherit from this
 */
export class BaseAttribute {
  type;

  constructor( type ) {
    this.type = type;
  }
}

/**
 * Types of ADD_ATTR attributes
 */
export const Attribute = {
  BaseAttribute
};
