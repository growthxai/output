import sdkVersion from '../generated/sdk_version.json' with { type: 'json' };

export interface SdkVersion {
  sdk: string;
}

export async function getSdkVersion(): Promise<SdkVersion> {
  return sdkVersion as SdkVersion;
}
