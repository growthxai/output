import { describe, it, expect } from 'vitest';
import { getSdkVersion } from './sdk_version.js';

describe( 'getSdkVersion', () => {
  it( 'should return the SDK version', async () => {
    const version = await getSdkVersion();

    expect( version ).toHaveProperty( 'sdk' );
  } );

  it( 'should return version in semver format', async () => {
    const version = await getSdkVersion();
    const semverPattern = /^\d+\.\d+\.\d+$/;

    expect( version.sdk ).toMatch( semverPattern );
  } );
} );
