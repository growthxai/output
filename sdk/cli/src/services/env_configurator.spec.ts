import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { configureEnvironmentVariables } from './env_configurator.js';

// Mock inquirer prompts
vi.mock( '@inquirer/prompts', () => ( {
  input: vi.fn(),
  confirm: vi.fn(),
  password: vi.fn()
} ) );

describe( 'configureEnvironmentVariables', () => {
  const testState = { tempDir: '', envExamplePath: '', envPath: '' };

  beforeEach( async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Create temporary directory for test files
    testState.tempDir = path.join( '/tmp', `test-env-${Date.now()}` );
    await fs.mkdir( testState.tempDir, { recursive: true } );
    testState.envExamplePath = path.join( testState.tempDir, '.env.example' );
    testState.envPath = path.join( testState.tempDir, '.env' );
  } );

  afterEach( async () => {
    // Clean up temporary directory
    try {
      await fs.rm( testState.tempDir, { recursive: true, force: true } );
    } catch {
      // Ignore cleanup errors
    }
  } );

  it( 'should copy .env.example to .env when skipPrompt is true', async () => {
    const envExampleContent = 'API_KEY=<FILL_ME_OUT>\nDATABASE_URL=localhost';
    await fs.writeFile( testState.envExamplePath, envExampleContent );

    const result = await configureEnvironmentVariables( testState.tempDir, true );

    expect( result ).toBe( false );
    const envContent = await fs.readFile( testState.envPath, 'utf-8' );
    expect( envContent ).toBe( envExampleContent );
  } );

  it( 'should return false if .env.example file does not exist', async () => {
    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( false );
  } );

  it( 'should handle missing .env.example gracefully when skipPrompt is true', async () => {
    const result = await configureEnvironmentVariables( testState.tempDir, true );

    expect( result ).toBe( false );
  } );

  it( 'should return false if user declines configuration', async () => {
    const { confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( false );

    await fs.writeFile(
      testState.envExamplePath,
      '# API key\nAPIKEY='
    );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( false );
    expect( vi.mocked( confirm ) ).toHaveBeenCalled();
  } );

  it( 'should return false if no empty variables exist', async () => {
    const { confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );

    await fs.writeFile(
      testState.envExamplePath,
      'APIKEY=my-secret-key'
    );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( false );
  } );

  it( 'should copy .env.example to .env when user confirms configuration', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'sk-proj-123' );

    const originalContent = `# API key
APIKEY=`;

    await fs.writeFile( testState.envExamplePath, originalContent );

    await configureEnvironmentVariables( testState.tempDir, false );

    // Both files should exist
    await expect( fs.access( testState.envExamplePath ) ).resolves.toBeUndefined();
    await expect( fs.access( testState.envPath ) ).resolves.toBeUndefined();
  } );

  it( 'should write configured values to .env while leaving .env.example unchanged', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'sk-proj-123' );

    const originalContent = `# API key
APIKEY=`;

    await fs.writeFile( testState.envExamplePath, originalContent );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( true );

    // .env should have the configured value
    const envContent = await fs.readFile( testState.envPath, 'utf-8' );
    expect( envContent ).toContain( 'APIKEY=sk-proj-123' );

    // .env.example should remain unchanged
    const envExampleContent = await fs.readFile( testState.envExamplePath, 'utf-8' );
    expect( envExampleContent ).toBe( originalContent );
  } );

  it( 'should prompt for empty variables and update .env', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'sk-proj-123' );
    vi.mocked( input ).mockResolvedValueOnce( '' );

    await fs.writeFile(
      testState.envExamplePath,
      `# API key for Anthropic
ANTHROPIC_API_KEY=

# API key for OpenAI
OPENAI_API_KEY=`
    );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( true );

    // Verify file was updated
    const content = await fs.readFile( testState.envPath, 'utf-8' );
    expect( content ).toContain( 'ANTHROPIC_API_KEY=sk-proj-123' );
    expect( content ).toContain( 'OPENAI_API_KEY=' );
  } );

  it( 'should preserve comments in .env file', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'test-key' );

    const originalContent = `# This is a comment
# API key configuration
APIKEY=

# Another comment
OTHER=value`;

    await fs.writeFile( testState.envExamplePath, originalContent );

    await configureEnvironmentVariables( testState.tempDir, false );

    const content = await fs.readFile( testState.envPath, 'utf-8' );

    expect( content ).toContain( '# This is a comment' );
    expect( content ).toContain( '# API key configuration' );
    expect( content ).toContain( '# Another comment' );
    expect( content ).toContain( 'OTHER=value' );
  } );

  it( 'should skip placeholder values and only prompt for truly empty variables', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'new-key' );

    await fs.writeFile(
      testState.envExamplePath,
      `APIKEY=your_api_key_here
EMPTY_KEY=`
    );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( true );
    expect( vi.mocked( input ) ).toHaveBeenCalledTimes( 1 );
    expect( vi.mocked( input ) ).toHaveBeenCalledWith( expect.objectContaining( {
      message: expect.stringContaining( 'EMPTY_KEY' )
    } ) );
  } );

  it( 'should skip variables with existing values', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'new-key' );

    await fs.writeFile(
      testState.envExamplePath,
      `EXISTING_KEY=existing-value

EMPTY_KEY=`
    );

    await configureEnvironmentVariables( testState.tempDir, false );

    // Should only prompt for EMPTY_KEY, not EXISTING_KEY
    expect( vi.mocked( input ) ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'should handle case where .env already exists (overwrite with copy)', async () => {
    const { input, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( input ).mockResolvedValueOnce( 'new-configured-value' );

    // Create existing .env with old content
    await fs.writeFile( testState.envPath, 'OLD_KEY=old-value' );

    // Create .env.example with new content
    await fs.writeFile( testState.envExamplePath, 'NEW_KEY=' );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( true );

    // .env should be overwritten with .env.example content and configured values
    const envContent = await fs.readFile( testState.envPath, 'utf-8' );
    expect( envContent ).toContain( 'NEW_KEY=new-configured-value' );
    expect( envContent ).not.toContain( 'OLD_KEY' );
  } );

  it( 'should return false if an error occurs during parsing', async () => {
    const { confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );

    await fs.writeFile(
      testState.envExamplePath,
      'KEY='
    );

    // Delete the .env.example file after access check but before parsing would happen
    // We simulate this by deleting during the copy operation
    const originalCopyFile = fs.copyFile;
    vi.spyOn( fs, 'copyFile' ).mockImplementation( async () => {
      throw new Error( 'Copy failed' );
    } );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    // Should return false when error occurs
    expect( result ).toBe( false );

    // Restore original function
    vi.mocked( fs.copyFile ).mockImplementation( originalCopyFile );
  } );

  it( 'should prompt for SECRET marker values with password input', async () => {
    const { password, confirm } = await import( '@inquirer/prompts' );
    vi.mocked( confirm ).mockResolvedValue( true );
    vi.mocked( password ).mockResolvedValueOnce( 'my-secret-api-key' );

    await fs.writeFile(
      testState.envExamplePath,
      `# API Key
ANTHROPIC_API_KEY=<FILL_ME_OUT>`
    );

    const result = await configureEnvironmentVariables( testState.tempDir, false );

    expect( result ).toBe( true );
    expect( vi.mocked( password ) ).toHaveBeenCalledTimes( 1 );

    const envContent = await fs.readFile( testState.envPath, 'utf-8' );
    expect( envContent ).toContain( 'ANTHROPIC_API_KEY=my-secret-api-key' );
  } );
} );
