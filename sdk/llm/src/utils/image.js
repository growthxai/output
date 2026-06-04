/**
 * Get the approximate file size from a base64 string.
 * @param {string} b64data
 * @returns {number} Size in bytes
 */
export const calculateBase64FileSize = b64data => {
  const baseSize = b64data.length * ( 3 / 4 );
  const paddingSize = [ b64data.at( -2 ), b64data.at( -1 ) ].filter( v => v === '=' ).length;
  return baseSize - paddingSize;
};
