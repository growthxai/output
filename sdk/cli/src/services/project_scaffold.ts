import { input, confirm } from '@inquirer/prompts';
import { ux } from '@oclif/core';
import { kebabCase, pascalCase } from 'change-case';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FolderAlreadyExistsError,
  UserCancelledError,
  DirectoryCreationError
} from '#types/errors.js';
import { createDirectory } from '#utils/file_system.js';
import {
  executeCommand,
  executeCommandWithMessages
} from '#utils/process.js';
import { getFrameworkVersion } from '#utils/framework_version.js';
import { getErrorMessage, getErrorCode } from '#utils/error_utils.js';
import { isDockerInstalled } from '#services/docker.js';
import { isClaudeCliAvailable } from '#utils/claude.js';
import { initCredentialsAtPath } from './credentials_service.js';
import { configureCredentials } from './credentials_configurator.js';
import { getTemplateFiles, processTemplateFile } from './template_processor.js';
import { initializeAgentConfig } from './coding_agents.js';
import { getProjectSuccessMessage } from './messages.js';

interface ProjectConfig {
  projectName: string;
  folderName: string;
  projectPath: string;
  description: string;
}

/**
 * Check for required dependencies (Docker and Claude CLI)
 * Prompts user to continue if dependencies are missing
 * @throws UserCancelledError if user declines to proceed without dependencies
 */
export async function checkDependencies(): Promise<void> {
  const dockerInstalled = isDockerInstalled();
  const claudeAvailable = isClaudeCliAvailable();

  if ( dockerInstalled && claudeAvailable ) {
    return;
  }

  const missingDeps: string[] = [];

  if ( !dockerInstalled ) {
    missingDeps.push( 'Docker (https://docs.docker.com/)' );
  }

  if ( !claudeAvailable ) {
    missingDeps.push( 'Claude CLI (https://code.claude.com/)' );
  }

  const depList = missingDeps.join( '\n  - ' );
  const message = `The following dependencies are missing:\n  - ${depList}\n\n` +
    'Some features may not work correctly without these dependencies.';

  ux.warn( message );

  try {
    const shouldProceed = await confirm( {
      message: 'Would you like to proceed anyway?',
      default: false
    } );

    if ( !shouldProceed ) {
      throw new UserCancelledError();
    }
  } catch {
    throw new UserCancelledError();
  }
}

const promptForFolderName = async ( projectName: string ): Promise<string> => {
  return await input( {
    message: 'What folder name should be used?',
    default: kebabCase( projectName )
  } ) || kebabCase( projectName );
};

const promptForProjectName = async ( defaultProjectName: string ): Promise<string> => {
  return await input( {
    message: 'What is your project name?',
    default: defaultProjectName
  } ) || defaultProjectName;
};

const generateProjectDescription = ( projectName: string ): string => {
  return `AI Agents & Workflows built with Output.ai for ${kebabCase( projectName )}`;
};

/**
 * Get project configuration from user input
 * @param userFolderNameArg - Optional folder name to skip folder name prompt
 */
export const getProjectConfig = async ( userFolderNameArg?: string ): Promise<ProjectConfig> => {
  const defaultProjectName = 'my-outputai-workflows';

  try {
    const projectName = userFolderNameArg ?
      userFolderNameArg :
      await promptForProjectName( defaultProjectName );

    const folderName = userFolderNameArg ?
      userFolderNameArg :
      await promptForFolderName( projectName );

    const description = generateProjectDescription( projectName );

    return {
      projectName,
      folderName,
      projectPath: path.resolve( process.cwd(), folderName ),
      description
    };
  } catch {
    throw new UserCancelledError();
  }
};

async function scaffoldProjectFiles(
  projectPath: string,
  projectName: string,
  description: string
): Promise<string[]> {
  const __filename = fileURLToPath( import.meta.url );
  const __dirname = path.dirname( __filename );
  const templatesDir = path.join( __dirname, '..', 'templates', 'project' );

  // Get framework version for dynamic template injection
  const frameworkVersion = await getFrameworkVersion();

  const templateVars = {
    projectName: kebabCase( projectName ),
    ProjectName: pascalCase( projectName ),
    description: description || `An Output.ai workflow for ${projectName}`,
    frameworkVersion: frameworkVersion.framework
  };

  const templateFiles = await getTemplateFiles( templatesDir );

  await Promise.all(
    templateFiles.map( templateFile => processTemplateFile( templateFile, projectPath, templateVars ) )
  );

  return templateFiles.map( f => f.outputName );
}

const CREDENTIALS_TEMPLATE_CONTENT = 'anthropic:\n  api_key: "<FILL_ME_OUT>"\nopenai:\n  api_key: "<FILL_ME_OUT>"\n';

async function createCredentialsTemplate( projectPath: string ): Promise<void> {
  const filePath = path.join( projectPath, 'config', 'credentials.yml.template' );
  await fs.mkdir( path.dirname( filePath ), { recursive: true } );
  await fs.writeFile( filePath, CREDENTIALS_TEMPLATE_CONTENT, 'utf-8' );
}

async function executeNpmInstall( projectPath: string ): Promise<void> {
  await executeCommand( 'npm', [ 'install' ], projectPath );
}

async function initializeAgents( projectPath: string ): Promise<void> {
  await initializeAgentConfig( { projectRoot: projectPath, force: false } );
}

/**
 * Format error message for init errors
 * Single responsibility: only format error messages, no cleanup logic
 */
function formatInitError( error: unknown, projectPath: string | null ): string {
  if ( error instanceof UserCancelledError ) {
    return error.message;
  }

  if ( error instanceof FolderAlreadyExistsError ) {
    return error.message;
  }

  const errorCode = getErrorCode( error );
  const pathSuffix = projectPath ? ` at ${projectPath}` : '';

  switch ( errorCode ) {
    case 'EEXIST': return 'Folder already exists';
    case 'EACCES': return `Permission denied${pathSuffix}`;
    case 'ENOSPC': return `Not enough disk space${pathSuffix}`;
    case 'EPERM': return `Operation not permitted${pathSuffix}`;
    case 'ENOENT': return `Required file or directory not found${pathSuffix}`;
    default: {
      return `Failed to create project${pathSuffix}: ${getErrorMessage( error )}`;
    }
  }
}

/**
 * Create a SIGINT handler for cleanup during init
 * Exits immediately without prompting to avoid race conditions
 * @param projectPath - Path to the project folder
 * @param folderCreated - Whether the folder has been created
 */
export function createSigintHandler(
  projectPath: string,
  folderCreated: boolean
): () => void {
  return () => {
    ux.stdout( '\n' );
    if ( folderCreated ) {
      ux.warn( `Incomplete project folder may exist at: ${projectPath}` );
      ux.warn( `Run: rm -rf "${projectPath}" to clean up` );
    }
    process.exit( 130 );
  };
}

function handleRunInitError(
  error: unknown,
  projectPath: string | null,
  projectFolderCreated: boolean
): never {
  const errorMessage = formatInitError( error, projectPath );

  if ( projectFolderCreated && projectPath ) {
    ux.warn( `Incomplete project folder may exist at: ${projectPath}` );
    ux.warn( `Run: rm -rf "${projectPath}" to clean up` );
  }

  throw new Error( errorMessage );
}

/**
 * State tracking for runInit function
 */
interface RunInitState {
  projectFolderCreated: boolean;
  projectPath: string;
}

/**
 * Run the init command workflow
 * @param skipEnv - Whether to skip environment configuration prompts
 * @param folderName - Optional folder name to skip folder name prompt
 */
export async function runInit(
  skipEnv: boolean = false,
  folderName?: string
): Promise<void> {
  // Track state for SIGINT cleanup using an object to avoid let
  const state: RunInitState = {
    projectFolderCreated: false,
    projectPath: ''
  };

  // Create and register SIGINT handler
  const sigintHandler = () => {
    const handler = createSigintHandler( state.projectPath, state.projectFolderCreated );
    handler();
  };

  process.on( 'SIGINT', sigintHandler );

  try {
    // Check dependencies first
    await checkDependencies();

    const config = await getProjectConfig( folderName );
    state.projectPath = config.projectPath;

    try {
      createDirectory( config.projectPath );
      state.projectFolderCreated = true;
    } catch ( error: unknown ) {
      throw new DirectoryCreationError(
        getErrorMessage( error ),
        config.projectPath
      );
    }
    ux.stdout( `Created project folder: ${config.folderName}` );

    const filesCreated = await scaffoldProjectFiles(
      config.projectPath,
      config.projectName,
      config.description
    );
    ux.stdout( `Created ${filesCreated.length} project files` );

    await createCredentialsTemplate( config.projectPath );
    initCredentialsAtPath( config.projectPath );
    ux.stdout( 'Credentials initialized' );

    const credentialsConfigured = await configureCredentials( config.projectPath, skipEnv );
    if ( credentialsConfigured ) {
      ux.stdout( 'API credentials configured' );
    }

    // Copy .env.example to .env (no secrets - they live in credentials.yml.enc)
    await fs.copyFile(
      path.join( config.projectPath, '.env.example' ),
      path.join( config.projectPath, '.env' )
    );

    await executeCommandWithMessages(
      () => initializeAgents( config.projectPath ),
      'Initializing agent system...',
      'Agent system initialized'
    );

    const installSuccess = await executeCommandWithMessages(
      () => executeNpmInstall( config.projectPath ),
      'Installing dependencies...',
      'Dependencies installed'
    );

    const nextSteps = getProjectSuccessMessage( config.folderName, installSuccess, credentialsConfigured );
    ux.stdout( 'Project created successfully!' );
    ux.stdout( nextSteps );
  } catch ( error: unknown ) {
    handleRunInitError( error, state.projectPath || null, state.projectFolderCreated );
  } finally {
    // Remove SIGINT handler on completion (success or error)
    process.removeListener( 'SIGINT', sigintHandler );
  }
}
