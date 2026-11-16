const units = [ 'B', 'KB', 'MB', 'GB' ];

/**
 * Formats a byte count for humans in binary units (1 MB = 1024 KB), as S3 reports sizes.
 *
 * @param bytes - Size in bytes
 * @returns Size such as `256 MB` or `1.5 KB`
 */
export function formatBytes( bytes: number ): string {
  const index = bytes > 0 ? Math.min( Math.floor( Math.log( bytes ) / Math.log( 1024 ) ), units.length - 1 ) : 0;
  const value = bytes / ( 1024 ** index );
  return `${Number( value.toFixed( 1 ) )} ${units[index]}`;
}
