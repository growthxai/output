// Detached helper spawned by spawnBackgroundRefresh (version_check.ts):
// refreshes the version-check cache off the critical path.
// Args: <currentVersion> <cacheDir>
import { bootstrapProxy } from '#utils/proxy.js';
import { runRefresh } from '#services/version_check.js';

await bootstrapProxy();
process.exitCode = await runRefresh( process.argv );
