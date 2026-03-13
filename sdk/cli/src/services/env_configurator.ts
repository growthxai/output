import { input, confirm, password } from '@inquirer/prompts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ux } from '@oclif/core';
import { getErrorMessage } from '#utils/error_utils.js';
import { UserCancelledError } from '#types/errors.js';

const COMMENT_LINE = /^\s*#/;
const COMMENTED_VAR = /^\s*#\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/;
const ACTIVE_VAR = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/;
const VAR_IN_COMMENT = /^\s*#\s*[A-Z_]+=/;
const SECRET_MARKER = '<SECRET>';

interface EnvVariable {
  key: string;
  value: string;
  description?: string;
  lineNumber: number;
  isCommented: boolean;
  originalLine: string;
  isSecret: boolean;
}

interface CreateEnvVariableOptions {
  lineNumber: number;
  line: string;
  isCommented: boolean;
  lastComment: string | null;
}

function extractDescription( commentLine: string ): string {
  return commentLine.replace( /^\s*#\s*/, '' ).trim();
}

function isSecret( value: string ): boolean {
  return value.trim() === SECRET_MARKER;
}

function createEnvVariable(
  match: RegExpMatchArray,
  options: CreateEnvVariableOptions
): EnvVariable {
  return {
    key: match[1],
    value: match[2],
    description: options.lastComment ? extractDescription( options.lastComment ) : undefined,
    lineNumber: options.lineNumber,
    isCommented: options.isCommented,
    originalLine: options.line,
    isSecret: isSecret( match[2] )
  };
}

async function parseEnvFile( filePath: string ): Promise<EnvVariable[]> {
  const content = await fs.readFile( filePath, 'utf-8' );
  const lines = content.split( '\n' );

  // Use an object to track state without reassigning
  const state = { lastComment: null as string | null };
  const variables: EnvVariable[] = [];

  lines.forEach( ( line, i ) => {
    // Check if line is a comment (but not a commented-out variable)
    if ( line.match( COMMENT_LINE ) && !line.match( VAR_IN_COMMENT ) ) {
      state.lastComment = line;
      return;
    }

    // Check for commented-out variable
    const commentedMatch = line.match( COMMENTED_VAR );
    if ( commentedMatch ) {
      variables.push( createEnvVariable(
        commentedMatch,
        {
          lineNumber: i,
          line,
          isCommented: true,
          lastComment: state.lastComment
        }
      ) );
      state.lastComment = null;
      return;
    }

    // Check for active variable
    const activeMatch = line.match( ACTIVE_VAR );
    if ( activeMatch ) {
      variables.push( createEnvVariable(
        activeMatch,
        {
          lineNumber: i,
          line,
          isCommented: false,
          lastComment: state.lastComment
        }
      ) );
      state.lastComment = null;
      return;
    }

    // Reset lastComment if we hit a blank line or non-comment line
    if ( line.trim() === '' || !line.match( COMMENT_LINE ) ) {
      state.lastComment = null;
    }
  } );

  return variables;
}

const isEmpty = ( value: string ): boolean => value.trim() === '';

const promptForVariables = async ( variables: EnvVariable[] ): Promise<EnvVariable[]> =>
  variables.reduce(
    async ( accPromise, variable ) => {
      const acc = await accPromise;

      // Skip if value is not empty and not a secret marker
      if ( !isEmpty( variable.value ) && !variable.isSecret ) {
        return [ ...acc, variable ];
      }

      const description = variable.description ? ` (${variable.description})` : '';

      // Use password prompt for secrets, regular input for others
      const newValue = variable.isSecret ?
        await password( {
          message: `${variable.key}${description} (secret):`,
          mask: true
        } ) :
        await input( {
          message: `${variable.key}${description}:`,
          default: ''
        } );

      return [
        ...acc,
        {
          ...variable,
          value: newValue,
          isCommented: newValue ? false : variable.isCommented,
          isSecret: false // Clear the secret flag after getting the actual value
        }
      ];
    },
    Promise.resolve( [] as EnvVariable[] )
  );

async function writeEnvFile(
  filePath: string,
  variables: EnvVariable[]
): Promise<void> {
  const content = await fs.readFile( filePath, 'utf-8' );
  const lines = content.split( '\n' );
  const variableMap = new Map( variables.map( v => [ v.lineNumber, v ] ) );

  const outputLines = lines.map( ( line, i ) => {
    const variable = variableMap.get( i );

    if ( variable ) {
      // Reconstruct the variable line
      return `${variable.isCommented ? '# ' : ''}${variable.key}=${variable.value}`;
    }
    // Preserve other lines (comments, blank lines, etc.)
    return line;
  } );

  await fs.writeFile( filePath, outputLines.join( '\n' ), 'utf-8' );
}

/**
 * Interactively configures environment variables for a project by prompting the user
 * to provide values for empty variables or variables marked as secrets.
 *
 * This function reads from .env.example and, when the user confirms configuration,
 * copies it to .env before prompting for values. The .env.example file remains
 * unchanged as a template for other developers.
 *
 * @param projectPath - The absolute path to the project directory containing the .env.example file
 * @param skipPrompt - If true, copies .env.example to .env without interactive prompts and returns false
 * @returns A promise that resolves to true if environment variables were successfully configured,
 *          false if configuration was skipped (no .env.example file, user declined, no variables to configure,
 *          or an error occurred)
 */
export async function configureEnvironmentVariables(
  projectPath: string,
  skipPrompt: boolean = false
): Promise<boolean> {
  try {
    ux.stdout( 'configuring environment variables...' );
    const envExamplePath = path.join( projectPath, '.env.example' );
    const envPath = path.join( projectPath, '.env' );

    // Copy .env.example to .env before configuring
    await fs.copyFile( envExamplePath, envPath );

    if ( skipPrompt ) {
      return false;
    }

    const shouldConfigure = await confirm( {
      message: 'Would you like to configure environment variables now?',
      default: true
    } );

    if ( !shouldConfigure ) {
      return false;
    }

    const variables = await parseEnvFile( envPath );

    const variablesToConfigure = variables.filter( v => isEmpty( v.value ) || v.isSecret );

    if ( variablesToConfigure.length === 0 ) {
      return false;
    }

    const updated = await promptForVariables( variables );

    await writeEnvFile( envPath, updated );

    return true;
  } catch ( error ) {
    // Ctrl+C in @inquirer/prompts throws ExitPromptError - propagate as UserCancelledError
    if ( error instanceof Error && error.name === 'ExitPromptError' ) {
      throw new UserCancelledError();
    }
    ux.warn( `Failed to configure environment variables: ${getErrorMessage( error )}` );
    return false;
  }
}
