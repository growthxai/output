import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchLatestVersion, isOutdated } from '#services/npm_update_service.js';

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

async function readCache( cacheDir: string, currentVersion: string ): Promise<VersionCheckResult | null> {
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
  } catch {
    return null;
  }
}

async function writeCache( cacheDir: string, result: VersionCheckResult ): Promise<void> {
  try {
    await mkdir( cacheDir, { recursive: true } );
    const cache: VersionCheckCache = { timestamp: Date.now(), result };
    await writeFile( join( cacheDir, CACHE_FILENAME ), JSON.stringify( cache ) );
  } catch {
    // Silently ignore cache write failures
  }
}

export async function checkForUpdate( currentVersion: string, cacheDir?: string ): Promise<VersionCheckResult> {
  if ( cacheDir ) {
    const cached = await readCache( cacheDir, currentVersion );
    if ( cached ) {
      return cached;
    }
  }

  const latestVersion = await fetchLatestVersion();

  if ( !latestVersion ) {
    return { updateAvailable: false, currentVersion, latestVersion: currentVersion };
  }

  const result: VersionCheckResult = {
    updateAvailable: isOutdated( currentVersion, latestVersion ),
    currentVersion,
    latestVersion
  };

  if ( cacheDir ) {
    await writeCache( cacheDir, result );
  }

  return result;
}
