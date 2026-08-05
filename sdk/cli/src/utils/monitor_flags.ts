import { Flags } from '@oclif/core';

/**
 * Poll cadence when `--interval` is not given. A caller-side default, not a
 * property of the loop: `streamWorkflowUpdates` takes `interval` as a required
 * option and never falls back.
 */
export const DEFAULT_INTERVAL_MS = 2500;

/**
 * Descriptions and constraints for the three flags that tune
 * `streamWorkflowUpdates`, single-sourced so `workflow monitor` and
 * `workflow start --monitor` can't drift apart on help text — the interval
 * caveat in particular is easy to lose in a copy-paste.
 */
const PAYLOADS_DESCRIPTION = 'Include decoded step input/output payloads';
const COLOR_DESCRIPTION = 'Colorize status output (use --no-color to disable)';
const INTERVAL_DESCRIPTION = 'Poll interval in milliseconds. Once a resumed poll is long-polling ' +
  'server-side for new events, this also bounds how long that block may last (capped at the ' +
  'server\'s configured max), so an idle workflow\'s update cadence is roughly twice this value ' +
  '(the long-poll bound, then this sleep) rather than a much longer, separate server default.';

/** For a command that always monitors, where oclif can apply the defaults itself. */
export function monitorStreamFlags() {
  return {
    'include-payloads': Flags.boolean( {
      description: PAYLOADS_DESCRIPTION,
      default: false
    } ),
    interval: Flags.integer( {
      description: INTERVAL_DESCRIPTION,
      default: DEFAULT_INTERVAL_MS,
      min: 1
    } ),
    color: Flags.boolean( {
      description: COLOR_DESCRIPTION,
      default: true,
      allowNo: true
    } )
  };
}

/**
 * For a command where monitoring is opt-in (`workflow start --monitor`).
 *
 * These carry no oclif `default` on purpose: a default counts as "provided" and
 * would silently satisfy `dependsOn`, letting `--interval` be accepted (and then
 * ignored) on a plain `workflow start`. The caller applies the defaults in
 * `run()`, so the interval's default is spelled out in the help text rather than
 * rendered by oclif.
 */
export function gatedMonitorStreamFlags( gatedBy: string ) {
  const gate = { dependsOn: [ gatedBy ], helpGroup: 'MONITOR' };
  const requires = ` (requires --${gatedBy})`;

  return {
    'include-payloads': Flags.boolean( {
      description: `${PAYLOADS_DESCRIPTION}${requires}`,
      ...gate
    } ),
    interval: Flags.integer( {
      description: `${INTERVAL_DESCRIPTION}${requires} [default: ${DEFAULT_INTERVAL_MS}]`,
      min: 1,
      ...gate
    } ),
    color: Flags.boolean( {
      description: `${COLOR_DESCRIPTION}${requires}`,
      allowNo: true,
      ...gate
    } )
  };
}
