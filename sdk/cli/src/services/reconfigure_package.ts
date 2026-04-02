import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processTemplate } from '#utils/template.js';

const packageJson = 'package.json';
const templateRelativePath = path.join( 'templates', 'project', 'package.json.template' );

/** Legacy script names from older versions of the project */
export const legacyScripts = [
  'dev'
] as const;

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
  } catch {
    throw new Error( `${packagePath} is not valid JSON.` );
  }
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

/**
 * Plan for aligning `scripts` with the scaffold template (reads only; no write until apply).
 */
export interface ReconfigurationPlan {
  packageJsonPath: string;
  packageJsonUpdatedContent: string;
  hasChanges: boolean;
  scriptsToRemove: ScriptToRemove[];
  scriptsToReplace: ScriptToReplace[];
  scriptsToAdd: ScriptToAdd[];
}

/**
 * Computes the package.json rewrite without writing. Use with {@link applyReconfiguration}.
 */
export function planReconfiguration( projectRoot: string ): ReconfigurationPlan {
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

  const packageJsonUpdatedContent = `${JSON.stringify( pkg, null, 2 )}\n`;
  const hasChanges = packageJsonUpdatedContent !== raw;

  return {
    packageJsonPath,
    packageJsonUpdatedContent,
    hasChanges,
    scriptsToRemove,
    scriptsToReplace,
    scriptsToAdd
  };
}

/**
 * Writes the planned package.json. No-op when {@link ReconfigurationPlan.hasChanges} is false.
 */
export function applyReconfiguration( plan: ReconfigurationPlan ): void {
  if ( !plan.hasChanges ) {
    return;
  }
  writeFileSync( plan.packageJsonPath, plan.packageJsonUpdatedContent, 'utf-8' );
}
