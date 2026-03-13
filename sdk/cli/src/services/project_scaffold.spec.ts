import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProjectConfig, checkDependencies, createSigintHandler } from './project_scaffold.js';
import { UserCancelledError } from '#types/errors.js';

// Mock the framework version utility
vi.mock( '#utils/framework_version.js', () => ( {
  getFrameworkVersion: vi.fn().mockResolvedValue( {
    framework: '0.1.1'
  } )
} ) );

// Mock other dependencies
vi.mock( '@inquirer/prompts', () => ( {
  input: vi.fn(),
  confirm: vi.fn()
} ) );

vi.mock( '#utils/file_system.js' );
vi.mock( '#utils/process.js' );
vi.mock( './env_configurator.js', () => ( {
  configureEnvironmentVariables: vi.fn().mockResolvedValue( false )
} ) );
vi.mock( './template_processor.js' );
vi.mock( './coding_agents.js' );
vi.mock( '#services/docker.js', () => ( {
  isDockerInstalled: vi.fn().mockReturnValue( true )
} ) );
vi.mock( '#utils/claude.js', () => ( {
  isClaudeCliAvailable: vi.fn().mockReturnValue( true )
} ) );

vi.mock( '@oclif/core', () => ( {
  ux: {
    stdout: vi.fn(),
    warn: vi.fn()
  }
} ) );

describe( 'project_scaffold', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'getProjectConfig', () => {
    it( 'should skip all prompts when folderName is provided', async () => {
      const { input } = await import( '@inquirer/prompts' );

      const config = await getProjectConfig( 'my-project' );

      expect( config.folderName ).toBe( 'my-project' );
      expect( config.projectName ).toBe( 'my-project' );
      expect( input ).not.toHaveBeenCalled();
    } );

    it( 'should auto-generate description when folderName provided', async () => {
      const config = await getProjectConfig( 'test-folder' );

      expect( config.description ).toBe( 'AI Agents & Workflows built with Output.ai for test-folder' );
    } );

    it( 'should prompt for project name and folder name when not provided', async () => {
      const { input } = await import( '@inquirer/prompts' );
      vi.mocked( input )
        .mockResolvedValueOnce( 'Test Project' )
        .mockResolvedValueOnce( 'test-project' );

      const config = await getProjectConfig();

      expect( config.projectName ).toBe( 'Test Project' );
      expect( config.folderName ).toBe( 'test-project' );
      expect( config.description ).toBe( 'AI Agents & Workflows built with Output.ai for test-project' );
      expect( input ).toHaveBeenCalledTimes( 2 );
    } );
  } );

  describe( 'checkDependencies', () => {
    it( 'should not prompt when all dependencies are available', async () => {
      const { isDockerInstalled } = await import( '#services/docker.js' );
      const { isClaudeCliAvailable } = await import( '#utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( isDockerInstalled ).mockReturnValue( true );
      vi.mocked( isClaudeCliAvailable ).mockReturnValue( true );

      await checkDependencies();

      expect( confirm ).not.toHaveBeenCalled();
    } );

    it( 'should prompt user when docker is missing', async () => {
      const { isDockerInstalled } = await import( '#services/docker.js' );
      const { isClaudeCliAvailable } = await import( '#utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( isDockerInstalled ).mockReturnValue( false );
      vi.mocked( isClaudeCliAvailable ).mockReturnValue( true );
      vi.mocked( confirm ).mockResolvedValue( true );

      await checkDependencies();

      expect( confirm ).toHaveBeenCalledWith(
        expect.objectContaining( {
          message: expect.stringContaining( 'proceed' )
        } )
      );
    } );

    it( 'should throw UserCancelledError when user declines to proceed', async () => {
      const { isDockerInstalled } = await import( '#services/docker.js' );
      const { isClaudeCliAvailable } = await import( '#utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( isDockerInstalled ).mockReturnValue( false );
      vi.mocked( isClaudeCliAvailable ).mockReturnValue( true );
      vi.mocked( confirm ).mockResolvedValue( false );

      await expect( checkDependencies() ).rejects.toThrow( UserCancelledError );
    } );
  } );

  describe( 'SIGINT handler', () => {
    it( 'should show cleanup message when project folder was created', async () => {
      const { ux } = await import( '@oclif/core' );

      const handler = createSigintHandler( '/test/project', true );

      const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( () => undefined as never );

      handler();

      expect( ux.warn ).toHaveBeenCalledWith(
        expect.stringContaining( '/test/project' )
      );
      expect( ux.warn ).toHaveBeenCalledWith(
        expect.stringContaining( 'rm -rf' )
      );
      expect( exitSpy ).toHaveBeenCalledWith( 130 );

      exitSpy.mockRestore();
    } );

    it( 'should exit immediately without warning when folder not created', async () => {
      const { ux } = await import( '@oclif/core' );

      const handler = createSigintHandler( '/nonexistent', false );

      const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( () => undefined as never );

      handler();

      expect( ux.warn ).not.toHaveBeenCalled();
      expect( exitSpy ).toHaveBeenCalledWith( 130 );

      exitSpy.mockRestore();
    } );

    it( 'should exit with code 130 (SIGINT convention)', async () => {
      const handler = createSigintHandler( '/test/project', true );

      const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( () => undefined as never );

      handler();

      expect( exitSpy ).toHaveBeenCalledWith( 130 );

      exitSpy.mockRestore();
    } );
  } );
} );
