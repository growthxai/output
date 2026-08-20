import { describe, expect, it, vi } from 'vitest';

const getProvider = vi.hoisted( () => vi.fn() );

vi.mock( '../ai_provider.js', () => ( {
  getProvider
} ) );

vi.mock( 'ai', () => ( {
  tool: def => def
} ) );

import { buildLoadSkillTool, loadPromptTools } from './tools.js';

const skills = [
  { name: 'writer', description: 'Writes copy', instructions: '# Writer\nDo it.' },
  { name: 'reviewer', description: 'Reviews drafts', instructions: 'Review carefully.' }
];

describe( 'buildLoadSkillTool', () => {
  it( 'returns a tool that loads instructions by skill name', () => {
    const tool = buildLoadSkillTool( skills );

    expect( tool.description ).toBe( 'Get detailed instructions for a named skill' );
    expect( tool.execute( { name: 'writer' } ) ).toBe( '# Writer\nDo it.' );
    expect( tool.execute( { name: 'reviewer' } ) ).toBe( 'Review carefully.' );
  } );

  it( 'returns available skill names when the name is unknown', () => {
    const tool = buildLoadSkillTool( skills );

    expect( tool.execute( { name: 'missing' } ) ).toBe(
      'Skill "missing" not found. Available: writer, reviewer'
    );
  } );

  it( 'lists no names when the catalog is empty', () => {
    const tool = buildLoadSkillTool( [] );

    expect( tool.execute( { name: 'writer' } ) ).toBe( 'Skill "writer" not found. Available: ' );
  } );
} );

describe( 'loadPromptTools', () => {
  it( 'returns null and does not load the provider when no tools are configured', () => {
    const result = loadPromptTools( {
      config: {
        provider: 'vertex',
        model: 'gemini-2.0-flash'
      }
    } );

    expect( result ).toBeNull();
    expect( getProvider ).not.toHaveBeenCalled();
  } );

  it( 'returns null and does not load the provider when tools config is empty', () => {
    const result = loadPromptTools( {
      config: {
        provider: 'vertex',
        tools: {}
      }
    } );

    expect( result ).toBeNull();
    expect( getProvider ).not.toHaveBeenCalled();
  } );

  it( 'throws when the provider has no tools object', () => {
    getProvider.mockReturnValue( vi.fn() );

    expect( () => loadPromptTools( {
      name: 'foo',
      config: {
        provider: 'azure',
        tools: {
          webSearch: {}
        }
      }
    } ) ).toThrow( 'Provider "azure" used by prompt "foo" does not support provider-specific tools.' );
  } );

  it( 'loads a single provider tool with config', () => {
    const googleSearch = vi.fn( config => ( { type: 'googleSearch', config } ) );
    const provider = {
      tools: {
        googleSearch
      }
    };
    getProvider.mockReturnValue( provider );

    const result = loadPromptTools( {
      config: {
        provider: 'vertex',
        tools: {
          googleSearch: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: 0.8
          }
        }
      }
    } );

    expect( getProvider ).toHaveBeenCalledWith( 'vertex' );
    expect( googleSearch ).toHaveBeenCalledWith( {
      mode: 'MODE_DYNAMIC',
      dynamicThreshold: 0.8
    } );
    expect( result ).toEqual( {
      googleSearch: {
        type: 'googleSearch',
        config: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.8
        }
      }
    } );
  } );

  it( 'loads multiple provider tools', () => {
    const googleSearch = vi.fn( config => ( { type: 'googleSearch', config } ) );
    const urlContext = vi.fn( config => ( { type: 'urlContext', config } ) );
    getProvider.mockReturnValue( {
      tools: {
        googleSearch,
        urlContext
      }
    } );

    const result = loadPromptTools( {
      config: {
        provider: 'vertex',
        tools: {
          googleSearch: {
            mode: 'MODE_DYNAMIC'
          },
          urlContext: {}
        }
      }
    } );

    expect( Object.keys( result ) ).toEqual( [ 'googleSearch', 'urlContext' ] );
    expect( googleSearch ).toHaveBeenCalledWith( { mode: 'MODE_DYNAMIC' } );
    expect( urlContext ).toHaveBeenCalledWith( {} );
    expect( result.googleSearch.type ).toBe( 'googleSearch' );
    expect( result.urlContext.type ).toBe( 'urlContext' );
  } );

  it( 'throws when a configured tool is not supported by the provider', () => {
    getProvider.mockReturnValue( {
      tools: {
        googleSearch: vi.fn(),
        urlContext: vi.fn()
      }
    } );

    expect( () => loadPromptTools( {
      name: 'foo',
      config: {
        provider: 'vertex',
        tools: {
          unknownTool: {}
        }
      }
    } ) ).toThrow( 'Provider "vertex" used by prompt "foo" does not support these tools: unknownTool.' );
  } );
} );
