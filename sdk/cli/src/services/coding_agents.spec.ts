import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkAgentStructure,
  prepareTemplateVariables,
  initializeAgentConfig,
  ensureOutputAISystem,
  ensureClaudePlugin
} from './coding_agents.js';
import { access } from 'node:fs/promises';
import fs from 'node:fs/promises';

vi.mock( 'node:fs/promises' );
vi.mock( '../utils/paths.js', () => ( {
  getTemplateDir: vi.fn().mockReturnValue( '/templates' )
} ) );
vi.mock( '../utils/template.js', () => ( {
  processTemplate: vi.fn().mockImplementation( ( content: string ) => content )
} ) );
vi.mock( '../utils/claude.js', () => ( {
  executeClaudeCommand: vi.fn().mockResolvedValue( undefined )
} ) );
vi.mock( '@oclif/core', () => ( {
  ux: {
    warn: vi.fn(),
    stdout: vi.fn(),
    colorize: vi.fn().mockImplementation( ( _color: string, text: string ) => text )
  }
} ) );
vi.mock( '@inquirer/prompts', () => ( {
  confirm: vi.fn()
} ) );

describe( 'coding_agents service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'checkAgentStructure', () => {
    it( 'should return needsInit true when settings.json does not exist', async () => {
      vi.mocked( access ).mockRejectedValue( { code: 'ENOENT' } );
      vi.mocked( fs.readFile ).mockRejectedValue( { code: 'ENOENT' } );

      const result = await checkAgentStructure( '/test/project' );

      expect( result ).toEqual( {
        isComplete: false,
        needsInit: true
      } );
    } );

    it( 'should return complete when settings and CLAUDE.md exist with valid configuration', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );
      vi.mocked( fs.readFile ).mockResolvedValue( JSON.stringify( {
        extraKnownMarketplaces: {
          'team-tools': {
            source: {
              source: 'github',
              repo: 'growthxai/output-claude-plugins'
            }
          }
        },
        enabledPlugins: {
          'outputai@outputai': true
        }
      } ) );

      const result = await checkAgentStructure( '/test/project' );

      expect( result ).toEqual( {
        isComplete: true,
        needsInit: false
      } );
    } );

    it( 'should return needsInit true when settings.json has wrong marketplace repo', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );
      vi.mocked( fs.readFile ).mockResolvedValue( JSON.stringify( {
        extraKnownMarketplaces: {
          'team-tools': {
            source: {
              source: 'github',
              repo: 'wrong/repo'
            }
          }
        },
        enabledPlugins: {
          'outputai@outputai': true
        }
      } ) );

      const result = await checkAgentStructure( '/test/project' );

      expect( result.isComplete ).toBe( false );
      expect( result.needsInit ).toBe( true );
    } );

    it( 'should return needsInit true when plugin is not enabled', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );
      vi.mocked( fs.readFile ).mockResolvedValue( JSON.stringify( {
        extraKnownMarketplaces: {
          'team-tools': {
            source: {
              source: 'github',
              repo: 'growthxai/output-claude-plugins'
            }
          }
        },
        enabledPlugins: {
          'outputai@outputai': false
        }
      } ) );

      const result = await checkAgentStructure( '/test/project' );

      expect( result.isComplete ).toBe( false );
      expect( result.needsInit ).toBe( true );
    } );
  } );

  describe( 'prepareTemplateVariables', () => {
    it( 'should return template variables with formatted date', () => {
      const variables = prepareTemplateVariables();

      expect( variables ).toHaveProperty( 'date' );
      expect( typeof variables.date ).toBe( 'string' );
      expect( variables.date ).toMatch( /^[A-Z][a-z]+ \d{1,2}, \d{4}$/ );
    } );
  } );

  describe( 'initializeAgentConfig', () => {
    beforeEach( () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( access ).mockRejectedValue( { code: 'ENOENT' } );
      vi.mocked( fs.readFile ).mockResolvedValue( 'template content' );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );
    } );

    it( 'should create exactly 2 outputs: settings.json and CLAUDE.md file', async () => {
      await initializeAgentConfig( {
        projectRoot: '/test/project',
        force: false
      } );

      expect( fs.mkdir ).toHaveBeenCalledTimes( 1 );
      expect( fs.mkdir ).toHaveBeenCalledWith(
        '/test/project/.claude',
        expect.objectContaining( { recursive: true } )
      );

      expect( fs.writeFile ).toHaveBeenCalledWith(
        '/test/project/.claude/settings.json',
        expect.any( String ),
        'utf-8'
      );
      expect( fs.writeFile ).toHaveBeenCalledWith(
        '/test/project/CLAUDE.md',
        expect.any( String ),
        'utf-8'
      );

      // No symlink should be created - CLAUDE.md is now a real file
      expect( fs.symlink ).not.toHaveBeenCalled();
    } );

    it( 'should skip existing files when force is false', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );

      await initializeAgentConfig( {
        projectRoot: '/test/project',
        force: false
      } );

      expect( fs.writeFile ).not.toHaveBeenCalled();
    } );

    it( 'should overwrite existing files when force is true', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );
      vi.mocked( fs.unlink ).mockResolvedValue( undefined );

      await initializeAgentConfig( {
        projectRoot: '/test/project',
        force: true
      } );

      expect( fs.writeFile ).toHaveBeenCalled();
    } );

  } );

  describe( 'ensureClaudePlugin', () => {
    beforeEach( () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( access ).mockRejectedValue( { code: 'ENOENT' } );
      vi.mocked( fs.readFile ).mockResolvedValue( 'template content' );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );
    } );

    it( 'should call registerPluginMarketplace and installOutputAIPlugin', async () => {
      const { executeClaudeCommand } = await import( '../utils/claude.js' );

      await ensureClaudePlugin( '/test/project' );

      expect( executeClaudeCommand ).toHaveBeenCalledWith(
        [ 'plugin', 'marketplace', 'add', 'growthxai/output-claude-plugins' ],
        '/test/project',
        { ignoreFailure: true }
      );
      expect( executeClaudeCommand ).toHaveBeenCalledWith(
        [ 'plugin', 'marketplace', 'update', 'outputai' ],
        '/test/project'
      );
      expect( executeClaudeCommand ).toHaveBeenCalledWith(
        [ 'plugin', 'install', 'outputai@outputai', '--scope', 'project' ],
        '/test/project'
      );
    } );

    it( 'should show error and prompt user when plugin commands fail', async () => {
      const { executeClaudeCommand } = await import( '../utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( executeClaudeCommand )
        .mockResolvedValueOnce( undefined ) // marketplace add
        .mockRejectedValueOnce( new Error( 'Plugin update failed' ) ); // marketplace update

      vi.mocked( confirm ).mockResolvedValue( true );

      await expect(
        ensureClaudePlugin( '/test/project' )
      ).resolves.not.toThrow();

      expect( confirm ).toHaveBeenCalledWith(
        expect.objectContaining( {
          message: expect.stringContaining( 'proceed' )
        } )
      );
    } );

    it( 'should allow user to proceed without plugin setup if they confirm', async () => {
      const { executeClaudeCommand } = await import( '../utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( executeClaudeCommand )
        .mockRejectedValue( new Error( 'All plugin commands fail' ) );

      vi.mocked( confirm ).mockResolvedValue( true );

      await expect(
        ensureClaudePlugin( '/test/project' )
      ).resolves.not.toThrow();
    } );
  } );

  describe( 'ensureOutputAISystem', () => {
    beforeEach( () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( access ).mockRejectedValue( { code: 'ENOENT' } );
      vi.mocked( fs.readFile ).mockResolvedValue( 'template content' );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );
    } );

    it( 'should return immediately when agent structure is complete', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );
      vi.mocked( fs.readFile ).mockResolvedValue( JSON.stringify( {
        extraKnownMarketplaces: {
          'team-tools': {
            source: { source: 'github', repo: 'growthxai/output-claude-plugins' }
          }
        },
        enabledPlugins: { 'outputai@outputai': true }
      } ) );

      await ensureOutputAISystem( '/test/project' );

      expect( fs.mkdir ).not.toHaveBeenCalled();
    } );

    it( 'should auto-initialize when settings.json is invalid', async () => {
      vi.mocked( access ).mockResolvedValue( undefined );
      vi.mocked( fs.readFile ).mockResolvedValue( JSON.stringify( {
        extraKnownMarketplaces: {
          'team-tools': {
            source: { source: 'github', repo: 'wrong/repo' }
          }
        },
        enabledPlugins: { 'outputai@outputai': true }
      } ) );

      await ensureOutputAISystem( '/test/project' );

      expect( fs.mkdir ).toHaveBeenCalled();
    } );
  } );

  describe( 'Claude plugin error handling', () => {
    beforeEach( () => {
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( access ).mockRejectedValue( { code: 'ENOENT' } );
      vi.mocked( fs.readFile ).mockResolvedValue( 'template content' );
      vi.mocked( fs.writeFile ).mockResolvedValue( undefined );
    } );

    it( 'should show error and prompt user when registerPluginMarketplace fails', async () => {
      const { executeClaudeCommand } = await import( '../utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( executeClaudeCommand )
        .mockResolvedValueOnce( undefined ) // marketplace add
        .mockRejectedValueOnce( new Error( 'Plugin update failed' ) ); // marketplace update

      vi.mocked( confirm ).mockResolvedValue( true );

      await expect(
        initializeAgentConfig( { projectRoot: '/test/project', force: true } )
      ).resolves.not.toThrow();

      expect( confirm ).toHaveBeenCalledWith(
        expect.objectContaining( {
          message: expect.stringContaining( 'proceed' )
        } )
      );
    } );

    it( 'should show error and prompt user when installOutputAIPlugin fails', async () => {
      const { executeClaudeCommand } = await import( '../utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( executeClaudeCommand )
        .mockResolvedValueOnce( undefined ) // marketplace add
        .mockResolvedValueOnce( undefined ) // marketplace update
        .mockRejectedValueOnce( new Error( 'Plugin install failed' ) ); // plugin install

      vi.mocked( confirm ).mockResolvedValue( true );

      await expect(
        initializeAgentConfig( { projectRoot: '/test/project', force: true } )
      ).resolves.not.toThrow();

      expect( confirm ).toHaveBeenCalledWith(
        expect.objectContaining( {
          message: expect.stringContaining( 'proceed' )
        } )
      );
    } );

    it( 'should allow user to proceed without plugin setup if they confirm', async () => {
      const { executeClaudeCommand } = await import( '../utils/claude.js' );
      const { confirm } = await import( '@inquirer/prompts' );

      vi.mocked( executeClaudeCommand )
        .mockRejectedValue( new Error( 'All plugin commands fail' ) );

      vi.mocked( confirm ).mockResolvedValue( true );

      await expect(
        initializeAgentConfig( { projectRoot: '/test/project', force: true } )
      ).resolves.not.toThrow();

      // File operations should still complete
      expect( fs.mkdir ).toHaveBeenCalled();
    } );
  } );
} );
