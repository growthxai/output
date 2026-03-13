import frameworkVersion from '../generated/framework_version.json' with { type: 'json' };

export interface FrameworkVersion {
  framework: string;
}

export async function getFrameworkVersion(): Promise<FrameworkVersion> {
  return frameworkVersion as FrameworkVersion;
}
