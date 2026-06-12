// Detached helper spawned by the init hook: refreshes the version-check
// cache off the critical path. Args: <currentVersion> <cacheDir>
import { bootstrapProxy } from '#utils/proxy.js';
import { refreshVersionCheck } from '#services/version_check.js';

const [ , , currentVersion, cacheDir ] = process.argv;

if ( currentVersion && cacheDir ) {
  await bootstrapProxy();
  await refreshVersionCheck( currentVersion, cacheDir );
}
