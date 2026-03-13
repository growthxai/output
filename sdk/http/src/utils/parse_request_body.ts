/**
 * Safely parses request body as JSON, falling back to string if parsing fails
 *
 * @param {Request} request - The fetch API request object
 * @returns {object|string|null} The parsed response
 */
export default async function parseRequestBody( request: Request ): Promise<object | string | null> {
  if ( !request.body ) {
    return null;
  }

  const cloned = request.clone();
  const body = await cloned.text();

  try {
    return JSON.parse( body );
  } catch {
    return body;
  }
}
