import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Orval post-generation hook to fix ES module imports by adding .js extensions
 * and update RequestInit types to use our custom ApiRequestOptions.
 * This is necessary because the SDK uses "type": "module" in package.json,
 * which requires all relative imports to have explicit .js extensions.
 */
export async function fixEsmImports( outputPath: string ): Promise<void> {
  const originalContent = readFileSync( outputPath, 'utf8' );

  // Apply all transformations in sequence
  const transformedContent = originalContent
    // Fix ESM imports
    .replace(
      /from '\.\.\/http_client'/g,
      'from \'../http_client.js\''
    )
    // Import ApiRequestOptions type from http_client
    .replace(
      /import { customFetchInstance } from '\.\.\/http_client\.js';/,
      match => {
        if ( !originalContent.includes( 'ApiRequestOptions' ) ) {
          return 'import { customFetchInstance, type ApiRequestOptions } from \'../http_client.js\';';
        }
        return match;
      }
    )
    // Replace RequestInit with ApiRequestOptions in function signatures
    .replace(
      /options\?: RequestInit/g,
      'options?: ApiRequestOptions'
    );

  writeFileSync( outputPath, transformedContent, 'utf8' );

  console.log( '✅ Fixed ESM imports and updated types in Orval generated file' );
}

/**
 * Run ESLint fix on generated files to ensure they follow project standards
 */
export async function runEslintFix(): Promise<void> {
  try {
    execSync( 'npx eslint --fix src/api/generated/api.ts', {
      cwd: process.cwd(),
      stdio: 'pipe' // Suppress output
    } );
    console.log( '✅ Applied ESLint fixes to generated file' );
  } catch ( error ) {
    if ( error instanceof Error && 'status' in error && error.status === 1 ) {
      console.log( '✅ Applied ESLint fixes to generated file (with warnings)' );
    } else {
      console.warn( '⚠️  ESLint fix encountered an issue:', error instanceof Error ? error.message : error );
    }
  }
}
