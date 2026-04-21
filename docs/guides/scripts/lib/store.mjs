/**
 * JSON read/write helpers + immutable mutations for releases.json.
 */
import fs from 'node:fs/promises';

const EMPTY_DATA = { releases: [] };

export async function readReleasesJson( path ) {
  try {
    const raw = await fs.readFile( path, 'utf8' );
    const parsed = JSON.parse( raw );
    return {
      generatedAt: parsed.generatedAt,
      releases: parsed.releases ?? []
    };
  } catch ( err ) {
    if ( err.code === 'ENOENT' ) {
      return { ...EMPTY_DATA };
    }
    throw err;
  }
}

export async function writeReleasesJson( path, data ) {
  const payload = {
    generatedAt: new Date().toISOString(),
    releases: data.releases
  };
  await fs.writeFile( path, `${JSON.stringify( payload, null, 2 )}\n` );
}

export function appendRelease( data, release ) {
  const filtered = data.releases.filter( r => r.version !== release.version );
  const releases = [ release, ...filtered ].sort( compareVersions );
  return { ...data, releases };
}

function parseVersion( version ) {
  const [ major, minor, patch ] = version.split( '.' ).map( Number );
  return { major, minor, patch };
}

function compareVersions( a, b ) {
  const va = parseVersion( a.version );
  const vb = parseVersion( b.version );
  if ( va.major !== vb.major ) return vb.major - va.major;
  if ( va.minor !== vb.minor ) return vb.minor - va.minor;
  return vb.patch - va.patch;
}
