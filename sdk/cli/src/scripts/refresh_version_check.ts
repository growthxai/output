// Detached helper spawned by spawnBackgroundRefresh (version_check.ts):
// refreshes the version-check cache off the critical path.
// Args: <currentVersion> <cacheDir>
import debugFactory from 'debug';
import { bootstrapProxy } from '#utils/proxy.js';
import { runRefresh } from '#services/version_check.js';

const debug = debugFactory( 'output-cli:version-check' );

await bootstrapProxy().catch( error => debug( 'Proxy bootstrap failed: %O', error ) );
process.exitCode = await runRefresh( process.argv );
