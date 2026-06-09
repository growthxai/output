// THIS IS SAFE TO RUN AT TEMPORAL'S SANDBOX ENVIRONMENT
import { defaultPayloadConverter } from '@temporalio/common';

/*
  @important: They plain JS values need to be converted to "payload":
  - https://typescript.temporal.io/api/namespaces/common/#headers
  - https://community.temporal.io/t/specify-temporal-headers-when-starting-workflow/6712
*/
export const memoToHeaders = memo =>
  Object.fromEntries(
    Object.entries( memo ?? {} ).map( ( [ k, v ] ) => [ k, defaultPayloadConverter.toPayload( v ) ] )
  );

// And the opposite of the function above
export const headersToObject = headers =>
  Object.fromEntries(
    Object.entries( headers ?? {} ).map( ( [ k, v ] ) => [ k, defaultPayloadConverter.fromPayload( v ) ] )
  );
