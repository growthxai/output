import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import debugFactory from 'debug';
import { fetchLatestVersion, isOutdated } from '#services/npm_update_service.js';

const debug = debugFactory( 'output-cli:version-check' );

export interface VersionCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
}

interface VersionCheckCache {
  timestamp: number;
  result: VersionCheckResult;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_FILENAME = 'version_check.json';

export async function readCachedResult( currentVersion: string, cacheDir: string ): Promise<VersionCheckResult | null> {
  try {
    const raw = await readFile( join( cacheDir, CACHE_FILENAME ), 'utf-8' );
    const cache: VersionCheckCache = JSON.parse( raw );

    if ( Date.now() - cache.timestamp > CACHE_TTL_MS ) {
      return null;
    }

    if ( cache.result.currentVersion !== currentVersion ) {
      return null;
    }

    return cache.result;
  } catch ( error ) {
    debug( 'Failed to read version cache: %O', error );
    return null;
  }
}

async function writeCache( cacheDir: string, result: VersionCheckResult ): Promise<void> {
  try {
    await mkdir( cacheDir, { recursive: true } );
    const cache: VersionCheckCache = { timestamp: Date.now(), result };
    await writeFile( join( cacheDir, CACHE_FILENAME ), JSON.stringify( cache ) );
  } catch ( error ) {
    debug( 'Failed to write version cache: %O', error );
  }
}

/**
 * Fetches the latest published version and persists the comparison to the
 * cache file. Skips the write when the latest version can't be determined
 * so the next invocation retries.
 */
export async function refreshVersionCheck( currentVersion: string, cacheDir: string ): Promise<void> {
  const latestVersion = await fetchLatestVersion();

  if ( !latestVersion ) {
    debug( 'Latest version unavailable, skipping cache write' );
    return;
  }

  await writeCache( cacheDir, {
    updateAvailable: isOutdated( currentVersion, latestVersion ),
    currentVersion,
    latestVersion
  } );
}

/**
 * Entry point for the detached refresh helper. Validates the argv contract
 * (`<currentVersion> <cacheDir>`) and returns the process exit code.
 */
export async function runRefresh( argv: string[] ): Promise<number> {
  const [ , , currentVersion, cacheDir ] = argv;

  if ( !currentVersion || !cacheDir ) {
    console.error( 'Usage: refresh_version_check.js <currentVersion> <cacheDir>' );
    return 1;
  }

  await refreshVersionCheck( currentVersion, cacheDir );
  return 0;
}

/**
 * Refreshes the version-check cache in a detached child process so the
 * registry roundtrip never blocks the invoked command. The result is picked
 * up from the cache on the next invocation.
 */
export function spawnBackgroundRefresh( currentVersion: string, cacheDir: string ): void {
  try {
    const scriptPath = fileURLToPath( new URL( '../scripts/refresh_version_check.js', import.meta.url ) );
    // stdio is discarded in normal use; surface the child's output when
    // debugging is on so refresh failures are diagnosable
    const stdio = process.env.DEBUG?.includes( 'output-cli' ) ? 'inherit' : 'ignore';
    spawn( process.execPath, [ scriptPath, currentVersion, cacheDir ], {
      detached: true,
      stdio
    } ).unref();
  } catch ( error ) {
    // Best-effort: a failed refresh only delays the update banner
    debug( 'Failed to spawn background version refresh: %O', error );
  }
}
