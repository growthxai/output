/**
 * Coding agent configuration service
 * Handles initialization and validation of agent configuration files
 */
import fs from 'node:fs/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { join } from 'node:path';
import { ux } from '@oclif/core';
import { confirm } from '@inquirer/prompts';
import debugFactory from 'debug';
import { getTemplateDir } from '#utils/paths.js';
import { executeClaudeCommand } from '#utils/claude.js';
import { processTemplate } from '#utils/template.js';
import { ClaudePluginError, UserCancelledError } from '#types/errors.js';

const debug = debugFactory( 'output-cli:agent' );

export interface StructureCheckResult {
  isComplete: boolean;
  needsInit: boolean;
}

export interface InitOptions {
  projectRoot: string;
  force: boolean;
}

interface SettingsJson {
  extraKnownMarketplaces?: {
    'team-tools'?: {
      source?: {
        source?: string;
        repo?: string;
      };
    };
  };
  enabledPlugins?: {
    'outputai@outputai'?: boolean;
  };
}

const EXPECTED_MARKETPLACE_REPO = 'growthxai/output';

interface EnsureClaudePluginOptions {
  silent?: boolean;
}

function createLogger( silent: boolean ): ( msg: string ) => void {
  return silent ? debug : ( msg: string ) => ux.stdout( ux.colorize( 'gray', msg ) );
}

async function fileExists( filePath: string ): Promise<boolean> {
  try {
    await access( filePath );
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate settings.json content has correct marketplace and plugin configuration
 */
async function validateSettingsJson( projectRoot: string ): Promise<boolean> {
  const settingsPath = join( projectRoot, '.claude/settings.json' );

  try {
    const content = await fs.readFile( settingsPath, 'utf-8' );
    const settings: SettingsJson = JSON.parse( content );

    const marketplaceRepo = settings.extraKnownMarketplaces?.['team-tools']?.source?.repo;
    const pluginEnabled = settings.enabledPlugins?.['outputai@outputai'];

    return marketplaceRepo === EXPECTED_MARKETPLACE_REPO && pluginEnabled === true;
  } catch {
    return false;
  }
}

export async function checkAgentStructure( projectRoot: string ): Promise<StructureCheckResult> {
  const settingsValid = await validateSettingsJson( projectRoot );
  const claudeMdExists = await fileExists( join( projectRoot, 'CLAUDE.md' ) );

  if ( !settingsValid ) {
    ux.warn( '.claude/settings.json missing critical configuration.' );
  }

  if ( !claudeMdExists ) {
    ux.warn( 'CLAUDE.md missing.' );
  }

  const isComplete = settingsValid && claudeMdExists;
  const needsInit = !settingsValid;

  return { isComplete, needsInit };
}

/**
 * Prepare template variables for file generation
 */
export function prepareTemplateVariables(): Record<string, string> {
  return {
    date: new Date().toLocaleDateString( 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    } )
  };
}

/**
 * Ensure a directory exists, creating it if necessary
 */
async function ensureDirectoryExists( dir: string ): Promise<void> {
  try {
    await fs.mkdir( dir, { recursive: true } );
    ux.stdout( ux.colorize( 'gray', `Created directory: ${dir}` ) );
  } catch ( error: unknown ) {
    if ( ( error as { code?: string } ).code !== 'EEXIST' ) {
      throw error;
    }
  }
}

/**
 * Create a file from a template
 */
async function createFromTemplate(
  templateSubpath: string,
  output: string,
  variables: Record<string, string>
): Promise<void> {
  const templateDir = getTemplateDir( 'agent_instructions' );
  const templatePath = path.join( templateDir, templateSubpath );
  const content = await fs.readFile( templatePath, 'utf-8' );
  const processed = processTemplate( content, variables );
  await fs.writeFile( output, processed, 'utf-8' );
  ux.stdout( ux.colorize( 'gray', `Created from template: ${output}` ) );
}

/**
 * Create a static file (no template processing)
 */
async function createStaticFile(
  templateSubpath: string,
  output: string
): Promise<void> {
  const templateDir = getTemplateDir( 'agent_instructions' );
  const templatePath = path.join( templateDir, templateSubpath );
  const content = await fs.readFile( templatePath, 'utf-8' );
  await fs.writeFile( output, content, 'utf-8' );
  ux.stdout( ux.colorize( 'gray', `Created file: ${output}` ) );
}

/**
 * Create .claude/settings.json file from template
 */
async function createSettingsFile( projectRoot: string, force: boolean ): Promise<void> {
  const claudeDir = join( projectRoot, '.claude' );
  await ensureDirectoryExists( claudeDir );

  const settingsPath = join( claudeDir, 'settings.json' );
  if ( force || !await fileExists( settingsPath ) ) {
    await createStaticFile( 'dotclaude/settings.json.template', settingsPath );
  } else {
    ux.warn( 'File already exists: .claude/settings.json (use --force to overwrite)' );
  }
}

/**
 * Create CLAUDE.md file from template
 */
async function createClaudeMdFile(
  projectRoot: string,
  force: boolean,
  variables: Record<string, string>
): Promise<void> {
  const claudeMdPath = join( projectRoot, 'CLAUDE.md' );
  if ( force || !await fileExists( claudeMdPath ) ) {
    await createFromTemplate( 'CLAUDE.md.template', claudeMdPath, variables );
  } else {
    ux.warn( 'File already exists: CLAUDE.md (use --force to overwrite)' );
  }
}

/**
 * Handle Claude plugin command errors with user confirmation to proceed
 * @param error - The error that occurred
 * @param commandName - Name of the command that failed
 * @param silent - If true, log to debug and re-throw without user confirmation
 * @throws UserCancelledError if user declines to proceed or presses Ctrl+C
 */
async function handlePluginError( error: unknown, commandName: string, silent = false ): Promise<void> {
  const pluginError = new ClaudePluginError( commandName, error instanceof Error ? error : undefined );

  if ( silent ) {
    debug( 'Plugin error: %s', pluginError.message );
    throw error;
  }

  ux.warn( pluginError.message );

  try {
    const shouldProceed = await confirm( {
      message:
        'Claude plugin setup failed.\n\nThis means your project will be without Output.ai-specific commands, skills, and subagents.' +
        ' You will not be able to use our AI-assisted workflow planning and building functionality.\n\n' +
        'Would you like to proceed without the Claude plugin setup?',
      default: false
    } );

    if ( !shouldProceed ) {
      throw new UserCancelledError();
    }
  } catch ( promptError ) {
    if ( promptError instanceof UserCancelledError ) {
      throw promptError;
    }
    // Ctrl+C throws ExitPromptError - convert to UserCancelledError
    throw new UserCancelledError();
  }
}

/**
 * Register and update the OutputAI plugin marketplace
 */
async function registerPluginMarketplace( projectRoot: string, silent = false ): Promise<void> {
  const log = createLogger( silent );

  log( 'Registering plugin marketplace...' );

  try {
    await executeClaudeCommand(
      [ 'plugin', 'marketplace', 'add', 'growthxai/output' ],
      projectRoot,
      { ignoreFailure: true }
    );
  } catch ( error ) {
    await handlePluginError( error, 'plugin marketplace add', silent );
    return;
  }

  log( 'Updating plugin marketplace...' );

  try {
    await executeClaudeCommand(
      [ 'plugin', 'marketplace', 'update', 'outputai' ],
      projectRoot
    );
  } catch ( error ) {
    await handlePluginError( error, 'plugin marketplace update outputai', silent );
  }
}

/**
 * Install the OutputAI plugin
 */
async function installOutputAIPlugin( projectRoot: string, silent = false ): Promise<void> {
  const log = createLogger( silent );

  log( 'Installing OutputAI plugin...' );

  try {
    await executeClaudeCommand(
      [ 'plugin', 'install', 'outputai@outputai', '--scope', 'project' ],
      projectRoot
    );
  } catch ( error ) {
    await handlePluginError( error, 'plugin install outputai@outputai', silent );
  }
}

/**
 * Ensure Claude Code plugin is configured
 * Registers marketplace, updates it, and installs the plugin
 */
export async function ensureClaudePlugin(
  projectRoot: string,
  options: EnsureClaudePluginOptions = {}
): Promise<void> {
  const { silent = false } = options;
  await registerPluginMarketplace( projectRoot, silent );
  await installOutputAIPlugin( projectRoot, silent );
}

/**
 * Initialize agent configuration files and register Claude Code plugin
 * Creates:
 * - .claude/settings.json (static JSON)
 * - CLAUDE.md (from template - user-customizable file)
 * Then runs Claude CLI commands to register the plugin marketplace and install the plugin
 */
export async function initializeAgentConfig( options: InitOptions ): Promise<void> {
  const { projectRoot, force } = options;
  const variables = prepareTemplateVariables();

  await createSettingsFile( projectRoot, force );
  await createClaudeMdFile( projectRoot, force, variables );
  await ensureClaudePlugin( projectRoot );
}

/**
 * Ensure OutputAI system is initialized
 * Creates configuration files and registers Claude Code plugin
 * @param projectRoot - Root directory of the project
 */
export async function ensureOutputAISystem( projectRoot: string ): Promise<void> {
  const { isComplete, needsInit } = await checkAgentStructure( projectRoot );

  if ( isComplete ) {
    return;
  }

  if ( needsInit ) {
    ux.warn( 'Agent configuration is incomplete. Initializing...' );
    await initializeAgentConfig( { projectRoot, force: false } );
  }
}
