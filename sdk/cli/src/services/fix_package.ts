import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processTemplate } from '#utils/template.js';

const packageJson = 'package.json';
const templateRelativePath = path.join( 'templates', 'project', 'package.json.template' );

/** Legacy script names from older versions of the project */
export const legacyScripts = [ 'dev' ] as const;

/** Hook files from the @outputai/credentials package, which was folded into @outputai/core */
const credentialsHookFilePattern = /@outputai[\\/]credentials([\\/]|$)/;

/** The @outputai/output umbrella package is replaced by its parts: core at runtime, the CLI for development */
const umbrellaPackage = '@outputai/output';
const umbrellaReplacements = [
  { name: '@outputai/core', section: 'dependencies' },
  { name: '@outputai/cli', section: 'devDependencies' }
] as const;
const dependencySections = [ 'dependencies', 'devDependencies' ] as const;
type DependencySection = typeof dependencySections[number];

function getTemplatesPackageJsonPath(): string {
  const __filename = fileURLToPath( import.meta.url );
  const __dirname = path.dirname( __filename );
  return path.join( __dirname, '..', templateRelativePath );
}

function readPackageJsonText( packagePath: string ): string {
  try {
    return readFileSync( packagePath, 'utf-8' );
  } catch ( error: unknown ) {
    if ( typeof error !== 'object' || error === null ) {
      throw error;
    }
    const code = ( error as { code?: unknown } ).code;
    if ( typeof code === 'string' && code === 'ENOENT' ) {
      throw new Error( `No ${packageJson} found at ${packagePath}. Run this command from your Output project root.` );
    }
    throw error;
  }
}

function parsePackageJsonObject( raw: string, packagePath: string ): Record<string, unknown> {
  try {
    return JSON.parse( raw ) as Record<string, unknown>;
  } catch ( error: unknown ) {
    throw new Error( `File ${packagePath} is not a valid JSON.`, { cause: error } );
  }
}

function removeCredentialsHookFiles( pkg: Record<string, unknown> ): string[] {
  const section = pkg.outputai as { hookFiles?: unknown } | undefined;
  if ( typeof section !== 'object' || section === null || !Array.isArray( section.hookFiles ) ) {
    return [];
  }

  const hookFiles = section.hookFiles as unknown[];
  const removed = hookFiles.filter( ( file ): file is string => typeof file === 'string' && credentialsHookFilePattern.test( file ) );
  section.hookFiles = hookFiles.filter( file => !removed.includes( file as string ) );
  return removed;
}

function getDependencySection( pkg: Record<string, unknown>, section: DependencySection ): Record<string, string> | null {
  const deps = pkg[section];
  return typeof deps === 'object' && deps !== null && !Array.isArray( deps ) ? deps as Record<string, string> : null;
}

function replaceUmbrellaPackage( pkg: Record<string, unknown> ): { dependenciesToRemove: DependencyChange[]; dependenciesToAdd: DependencyChange[] } {
  const dependenciesToRemove: DependencyChange[] = [];
  const dependenciesToAdd: DependencyChange[] = [];

  const section = dependencySections.find( s => typeof getDependencySection( pkg, s )?.[umbrellaPackage] === 'string' );
  if ( !section ) {
    return { dependenciesToRemove, dependenciesToAdd };
  }

  const deps = getDependencySection( pkg, section ) as Record<string, string>;
  const version = deps[umbrellaPackage];
  delete deps[umbrellaPackage];
  dependenciesToRemove.push( { section, name: umbrellaPackage, version } );

  const isDeclared = ( name: string ): boolean => dependencySections.some( s => Object.hasOwn( getDependencySection( pkg, s ) ?? {}, name ) );
  for ( const { name, section: target } of umbrellaReplacements ) {
    if ( isDeclared( name ) ) {
      continue;
    }
    pkg[target] = { ...getDependencySection( pkg, target ), [name]: version };
    dependenciesToAdd.push( { section: target, name, version } );
  }

  return { dependenciesToRemove, dependenciesToAdd };
}

function parseTemplatePackageJson( processed: string ): { scripts?: Record<string, string> } {
  try {
    return JSON.parse( processed ) as { scripts?: Record<string, string> };
  } catch {
    throw new Error( `Internal error: failed to parse processed ${templateRelativePath}.` );
  }
}

export interface ScriptToRemove {
  key: string;
  value: string;
}

export interface ScriptToAdd {
  key: string;
  value: string;
}

export interface ScriptToReplace {
  key: string;
  before: string;
  after: string;
}

export interface DependencyChange {
  section: DependencySection;
  name: string;
  version: string;
}

/**
 * Plan for aligning `scripts` with the scaffold template, replacing the `@outputai/output` umbrella package
 * and dropping stale hook files (reads only; no write until apply).
 */
export interface FixPlan {
  packageJsonPath: string;
  packageJsonUpdatedContent: string;
  hasChanges: boolean;
  scriptsToRemove: ScriptToRemove[];
  scriptsToReplace: ScriptToReplace[];
  scriptsToAdd: ScriptToAdd[];
  dependenciesToRemove: DependencyChange[];
  dependenciesToAdd: DependencyChange[];
  hookFilesToRemove: string[];
}

/**
 * Computes the package.json rewrite without writing. Use with {@link applyFix}.
 */
export function planFix( projectRoot: string ): FixPlan {
  const packageJsonPath = path.join( projectRoot, packageJson );
  const raw = readPackageJsonText( packageJsonPath );
  const pkg = parsePackageJsonObject( raw, packageJsonPath );

  const originalScripts = typeof pkg.scripts === 'object' && pkg.scripts !== null && !Array.isArray( pkg.scripts ) ?
    { ...( pkg.scripts as Record<string, string> ) } :
    {};

  const scripts = { ...originalScripts };

  const scriptsToRemove: ScriptToRemove[] = [];

  for ( const key of legacyScripts ) {
    if ( Object.hasOwn( scripts, key ) ) {
      scriptsToRemove.push( { key, value: scripts[key] } );
      delete scripts[key];
    }
  }

  const templateRaw = readFileSync( getTemplatesPackageJsonPath(), 'utf-8' );
  const templateVars = { projectName: '', description: '', frameworkVersion: '' };
  const processed = processTemplate( templateRaw, templateVars );
  const templatePkg = parseTemplatePackageJson( processed );
  const templateScripts = templatePkg.scripts;

  if ( !templateScripts || typeof templateScripts !== 'object' ) {
    throw new Error( `Internal error: ${templateRelativePath} has no scripts object.` );
  }

  const scriptsToAdd: ScriptToAdd[] = [];
  const scriptsToReplace: ScriptToReplace[] = [];

  for ( const [ key, after ] of Object.entries( templateScripts ) ) {
    const before = originalScripts[key];
    if ( before !== after ) {
      if ( Object.hasOwn( originalScripts, key ) ) {
        scriptsToReplace.push( { key, before: before as string, after } );
      } else {
        scriptsToAdd.push( { key, value: after } );
      }
    }
    scripts[key] = after;
  }

  pkg.scripts = scripts;

  const { dependenciesToRemove, dependenciesToAdd } = replaceUmbrellaPackage( pkg );
  const hookFilesToRemove = removeCredentialsHookFiles( pkg );

  const packageJsonUpdatedContent = `${JSON.stringify( pkg, null, 2 )}\n`;
  const hasChanges = packageJsonUpdatedContent !== raw;

  return {
    packageJsonPath,
    packageJsonUpdatedContent,
    hasChanges,
    scriptsToRemove,
    scriptsToReplace,
    scriptsToAdd,
    dependenciesToRemove,
    dependenciesToAdd,
    hookFilesToRemove
  };
}

/**
 * Writes the planned package.json. No-op when {@link FixPlan.hasChanges} is false.
 */
export function applyFix( plan: FixPlan ): void {
  if ( !plan.hasChanges ) {
    return;
  }
  writeFileSync( plan.packageJsonPath, plan.packageJsonUpdatedContent, 'utf-8' );
}
