/**
 * Parse docker compose stderr for host-port bind failures and turn them into
 * an actionable hint that names the conflicting port and the env var to
 * override.
 *
 * Docker compose surfaces port collisions through two common error shapes:
 *   - "Bind for 0.0.0.0:3001 failed: port is already allocated"
 *   - "failed to bind host port for 0.0.0.0:7233:.../tcp: address already in use"
 *
 * We match both, extract the host port, then map it back to the env var that
 * sets it. The map prefers a runtime lookup of resolved ports (so a user who
 * already set OUTPUT_API_HOST_PORT=3050 sees that var named when 3050
 * collides) and falls back to a default-port table for the unresolved case.
 */

const PORT_BIND_PATTERNS: RegExp[] = [
  /Bind for [^:\s]+:(\d+) failed: port is already allocated/,
  /failed to bind host port for [^:\s]+:(\d+)[^]*?address already in use/,
  /listen tcp [^:\s]+:(\d+):\s*bind: address already in use/
];

const DEFAULT_PORT_TO_ENV_VAR: Record<number, string> = {
  3001: 'OUTPUT_API_HOST_PORT',
  8080: 'OUTPUT_TEMPORAL_UI_HOST_PORT',
  7233: 'OUTPUT_TEMPORAL_HOST_PORT'
};

const RESOLVED_PORT_KEY_TO_ENV_VAR: Record<string, string> = {
  api: 'OUTPUT_API_HOST_PORT',
  temporalUi: 'OUTPUT_TEMPORAL_UI_HOST_PORT',
  temporal: 'OUTPUT_TEMPORAL_HOST_PORT'
};

/**
 * Find the first host port mentioned in a docker compose bind failure.
 * Returns null when no recognized pattern matches.
 */
export function extractCollidedPort( stderr: string ): number | null {
  if ( !stderr ) {
    return null;
  }
  for ( const pattern of PORT_BIND_PATTERNS ) {
    const match = stderr.match( pattern );
    if ( match ) {
      return parseInt( match[1], 10 );
    }
  }
  return null;
}

/**
 * Map a host port to the env var that controls it. Resolved ports win over
 * the static default map so user-overridden ports still resolve to the right
 * var. Returns null when the port isn't owned by any of our services.
 */
function envVarForPort(
  port: number,
  resolvedPorts: Record<string, number>
): string | null {
  for ( const [ key, value ] of Object.entries( resolvedPorts ) ) {
    if ( value === port && RESOLVED_PORT_KEY_TO_ENV_VAR[key] ) {
      return RESOLVED_PORT_KEY_TO_ENV_VAR[key];
    }
  }
  return DEFAULT_PORT_TO_ENV_VAR[port] ?? null;
}

/**
 * Render a single port collision as two lines: the "Port N is already in use"
 * statement and either an env-var override suggestion or a generic "stop the
 * process" fallback.
 */
function formatSingleCollision(
  port: number,
  resolvedPorts: Record<string, number>
): string {
  const envVar = envVarForPort( port, resolvedPorts );
  if ( envVar ) {
    return [
      `Port ${port} is already in use.`,
      `Override it in your .env file:  ${envVar}=<other port>`
    ].join( '\n' );
  }
  return [
    `Port ${port} is already in use.`,
    'Stop the process holding it, or change the host port in your compose file.'
  ].join( '\n' );
}

/**
 * Build an actionable, multi-line hint for the first port collision found in
 * stderr. Returns null when no collision is detected. When the colliding port
 * is one we own (api / temporalUi / temporal), the hint names the env var
 * that overrides it; otherwise it suggests freeing the port.
 */
export function formatPortCollisionHint(
  stderr: string,
  resolvedPorts: Record<string, number>
): string | null {
  const port = extractCollidedPort( stderr );
  if ( port === null ) {
    return null;
  }
  return formatSingleCollision( port, resolvedPorts );
}

/**
 * Build a hint from a known list of colliding ports. For a single collision
 * the output matches `formatPortCollisionHint` exactly so callers stay
 * symmetric. For multiple collisions a bulleted list is rendered, each line
 * naming the env var that overrides that specific port (or a generic
 * suggestion when the port isn't one we own).
 */
export function formatPortCollisionsHint(
  ports: number[],
  resolvedPorts: Record<string, number>
): string {
  if ( ports.length === 0 ) {
    return '';
  }
  if ( ports.length === 1 ) {
    return formatSingleCollision( ports[0], resolvedPorts );
  }
  const lines = [ 'Multiple host ports are already in use:' ];
  for ( const port of ports ) {
    const envVar = envVarForPort( port, resolvedPorts );
    lines.push(
      envVar ?
        `  • Port ${port} — override with ${envVar}=<other port>` :
        `  • Port ${port} — stop the process holding it`
    );
  }
  return lines.join( '\n' );
}