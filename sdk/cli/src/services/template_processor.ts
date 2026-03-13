import * as fs from 'node:fs/promises';
import { Dirent } from 'node:fs';
import * as path from 'node:path';
import type { TemplateFile } from '#types/generator.js';
import { processTemplate } from '#utils/template.js';

const TEMPLATE_EXTENSION = '.template';

const isTemplateFile = ( file: string ): boolean => file.endsWith( TEMPLATE_EXTENSION );

const fileToTemplateFile = ( file: string, templatesDir: string, relativePath: string = '' ): TemplateFile => {
  const fullPath = relativePath ? path.join( relativePath, file ) : file;
  return {
    name: file,
    path: path.join( templatesDir, relativePath, file ),
    outputName: fullPath.replace( TEMPLATE_EXTENSION, '' )
  };
};

const processEntry = async (
  entry: Dirent,
  templatesDir: string,
  relativePath: string,
  getFilesRecursively: ( dir: string, rel: string ) => Promise<TemplateFile[]>
): Promise<TemplateFile[]> => {
  if ( entry.isDirectory() ) {
    const subDir = relativePath ? path.join( relativePath, entry.name ) : entry.name;
    return getFilesRecursively( templatesDir, subDir );
  }

  if ( entry.isFile() && isTemplateFile( entry.name ) ) {
    return [ fileToTemplateFile( entry.name, templatesDir, relativePath ) ];
  }

  return [];
};

async function getTemplateFilesRecursive(
  templatesDir: string,
  relativePath: string = ''
): Promise<TemplateFile[]> {
  const fullPath = relativePath ? path.join( templatesDir, relativePath ) : templatesDir;
  const entries = await fs.readdir( fullPath, { withFileTypes: true } );

  const results = await Promise.all(
    entries.map( entry => processEntry( entry, templatesDir, relativePath, getTemplateFilesRecursive ) )
  );

  return results.flatMap( x => x );
}

/**
 * Get list of template files from a directory
 * Automatically discovers all .template files (including in subdirectories) and derives output names
 */
export async function getTemplateFiles( templatesDir: string ): Promise<TemplateFile[]> {
  return getTemplateFilesRecursive( templatesDir );
}

/**
 * Process a single template file
 */
export async function processTemplateFile(
  templateFile: TemplateFile,
  targetDir: string,
  variables: Record<string, string>
): Promise<void> {
  const templateContent = await fs.readFile( templateFile.path, 'utf-8' );
  const processedContent = processTemplate( templateContent, variables );
  const outputPath = path.join( targetDir, templateFile.outputName );

  // Create parent directories if they don't exist
  const outputDir = path.dirname( outputPath );
  await fs.mkdir( outputDir, { recursive: true } );

  await fs.writeFile( outputPath, processedContent, 'utf-8' );
}

/**
 * Process all template files
 */
export async function processAllTemplates(
  templateFiles: TemplateFile[],
  targetDir: string,
  variables: Record<string, string>
): Promise<string[]> {
  return Promise.all(
    templateFiles.map( async templateFile => {
      await processTemplateFile( templateFile, targetDir, variables );
      return templateFile.outputName;
    } )
  );
}
