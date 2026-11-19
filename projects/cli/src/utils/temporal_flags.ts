import { Flags } from '@oclif/core';

/**
 * Flags shared by every command that talks to Temporal directly.
 * Spread into `static flags`. Secrets (API key, TLS material) have no flag on purpose: they come from the profile or the env.
 */
export const temporalFlags = {
  profile: Flags.string( {
    description: 'Temporal profile to read from temporal.toml (defaults to TEMPORAL_PROFILE, then "default")'
  } ),
  address: Flags.string( {
    description: 'Temporal server address, overrides the profile and TEMPORAL_ADDRESS (default: localhost on the dev Temporal port, 7233)'
  } ),
  namespace: Flags.string( {
    description: 'Temporal namespace, overrides the profile and TEMPORAL_NAMESPACE (default: default)'
  } )
};

export type TemporalFlags = {
  profile?: string;
  address?: string;
  namespace?: string;
};
