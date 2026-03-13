export function isValidUrl( urlString: string ): boolean {
  try {
    const url = new URL( urlString );
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateUrl( urlString: string ): string {
  if ( !isValidUrl( urlString ) ) {
    throw new Error( `Invalid URL: ${urlString}` );
  }
  return urlString;
}
