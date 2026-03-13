import { describe, it, expect } from 'vitest';
import { getFrameworkVersion } from './framework_version.js';

describe( 'getFrameworkVersion', () => {
  it( 'should return the framework version', async () => {
    const version = await getFrameworkVersion();

    expect( version ).toHaveProperty( 'framework' );
  } );

  it( 'should return version in semver format', async () => {
    const version = await getFrameworkVersion();
    const semverPattern = /^\d+\.\d+\.\d+$/;

    expect( version.framework ).toMatch( semverPattern );
  } );
} );
