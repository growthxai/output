import type { PostWorkflowRunBodySearchAttributes } from '#api/generated/api.js';
import { parseInputFlag } from '#utils/input_parser.js';

const isScalar = ( value: unknown ): boolean =>
  [ 'string', 'number', 'boolean' ].includes( typeof value );

const isValidValue = ( value: unknown ): boolean =>
  isScalar( value ) || ( Array.isArray( value ) && value.every( v => typeof v === 'string' ) );

const validate = ( parsed: unknown ): PostWorkflowRunBodySearchAttributes => {
  if ( typeof parsed !== 'object' || parsed === null || Array.isArray( parsed ) ) {
    throw new Error( '--search-attributes must be a JSON object, e.g. \'{"ClientId":"acme"}\'' );
  }

  const invalid = Object.entries( parsed ).find( ( [ , value ] ) => !isValidValue( value ) );
  if ( invalid ) {
    throw new Error( `--search-attributes value for "${invalid[0]}" must be a string, number, boolean, or array of strings` );
  }

  return parsed as PostWorkflowRunBodySearchAttributes;
};

const parse = ( flag: string ): unknown => {
  try {
    return parseInputFlag( flag );
  } catch ( error ) {
    throw new Error( `--search-attributes: ${( error as Error ).message}` );
  }
};

export const parseSearchAttributesFlag = ( flag?: string ): PostWorkflowRunBodySearchAttributes | undefined =>
  ( flag === undefined ? undefined : validate( parse( flag ) ) );
