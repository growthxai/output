import { it, expect, vi, afterEach, describe } from 'vitest';

const openaiImpl = vi.fn( model => `openai:${model}` );
const azureImpl = vi.fn( model => `azure:${model}` );
const anthropicImpl = vi.fn( model => `anthropic:${model}` );
const bedrockImpl = vi.fn( model => `bedrock:${model}` );
const perplexityImpl = vi.fn( model => `perplexity:${model}` );

// OpenAI mock with tools support
vi.mock( '@ai-sdk/openai', () => {
  const openaiMock = ( ...values ) => openaiImpl( ...values );
  openaiMock.tools = {
    webSearch: ( config = {} ) => ( { type: 'webSearch', config } )
  };
  return { openai: openaiMock };
} );

// Azure mock without tools support
vi.mock( '@ai-sdk/azure', () => ( {
  azure: ( ...values ) => azureImpl( ...values )
} ) );

// Anthropic mock with tools support
vi.mock( '@ai-sdk/anthropic', () => {
  const anthropicMock = ( ...values ) => anthropicImpl( ...values );
  anthropicMock.tools = {
    webSearch_20250305: ( config = {} ) => ( { type: 'webSearch_20250305', config } ),
    bash_20241022: ( config = {} ) => ( { type: 'bash_20241022', config } ),
    bash_20250124: ( config = {} ) => ( { type: 'bash_20250124', config } ),
    codeExecution_20250522: ( config = {} ) => ( { type: 'codeExecution_20250522', config } ),
    codeExecution_20250825: ( config = {} ) => ( { type: 'codeExecution_20250825', config } )
  };
  return { anthropic: anthropicMock };
} );

// Bedrock mock with tools support
vi.mock( '@ai-sdk/amazon-bedrock', () => {
  const bedrockMock = ( ...values ) => bedrockImpl( ...values );
  bedrockMock.tools = {
    bash_20241022: ( config = {} ) => ( { type: 'bash_20241022', config } ),
    textEditor_20241022: ( config = {} ) => ( { type: 'textEditor_20241022', config } ),
    textEditor_20250429: ( config = {} ) => ( { type: 'textEditor_20250429', config } ),
    computer_20241022: ( config = {} ) => ( { type: 'computer_20241022', config } )
  };
  return { bedrock: bedrockMock };
} );

// Perplexity mock
vi.mock( '@ai-sdk/perplexity', () => ( {
  perplexity: ( ...values ) => perplexityImpl( ...values )
} ) );

// Vertex mock with tools support
vi.mock( '@ai-sdk/google-vertex', () => {
  const vertexFn = model => `vertex:${model}`;
  vertexFn.tools = {
    googleSearch: ( config = {} ) => ( { type: 'googleSearch', config } ),
    fileSearch: ( config = {} ) => ( { type: 'fileSearch', config } ),
    urlContext: ( config = {} ) => ( { type: 'urlContext', config } ),
    enterpriseWebSearch: ( config = {} ) => ( { type: 'enterpriseWebSearch', config } ),
    googleMaps: ( config = {} ) => ( { type: 'googleMaps', config } ),
    codeExecution: ( config = {} ) => ( { type: 'codeExecution', config } ),
    vertexRagStore: ( config = {} ) => ( { type: 'vertexRagStore', config } )
  };
  return { vertex: vertexFn };
} );

import { loadModel, loadTools, registerProvider, getRegisteredProviders, providers, builtInProviders } from './ai_model.js';

afterEach( async () => {
  await vi.resetModules();
  vi.clearAllMocks();
} );

describe( 'loadModel', () => {
  it( 'loads model using selected provider', () => {
    const result = loadModel( { config: { provider: 'openai', model: 'gpt-4o-mini' } } );

    expect( result ).toBe( 'openai:gpt-4o-mini' );
    expect( openaiImpl ).toHaveBeenCalledWith( 'gpt-4o-mini' );
    expect( azureImpl ).not.toHaveBeenCalled();
    expect( anthropicImpl ).not.toHaveBeenCalled();
  } );

  it( 'loads model using bedrock provider', () => {
    const result = loadModel( { config: { provider: 'bedrock', model: 'anthropic.claude-sonnet-4-20250514-v1:0' } } );

    expect( result ).toBe( 'bedrock:anthropic.claude-sonnet-4-20250514-v1:0' );
    expect( bedrockImpl ).toHaveBeenCalledWith( 'anthropic.claude-sonnet-4-20250514-v1:0' );
  } );

  it( 'loads model using perplexity provider', () => {
    const result = loadModel( { config: { provider: 'perplexity', model: 'sonar-pro' } } );

    expect( result ).toBe( 'perplexity:sonar-pro' );
    expect( perplexityImpl ).toHaveBeenCalledWith( 'sonar-pro' );
  } );
} );

describe( 'loadTools', () => {
  // Category 1: Basic Functionality (5 tests)
  describe( 'Basic Functionality', () => {
    it( 'returns null when no tools configured', () => {
      const result = loadTools( { config: { provider: 'vertex', model: 'gemini-2.0-flash' } } );
      expect( result ).toBeNull();
    } );

    it( 'returns null when tools is empty object', () => {
      const result = loadTools( { config: { provider: 'vertex', model: 'gemini-2.0-flash', tools: {} } } );
      expect( result ).toBeNull();
    } );

    it( 'loads single tool with empty config', () => {
      const result = loadTools( {
        config: { provider: 'vertex', tools: { googleSearch: {} } }
      } );

      expect( result ).toEqual( {
        googleSearch: { type: 'googleSearch', config: {} }
      } );
    } );

    it( 'loads single tool with config', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: { googleSearch: { mode: 'MODE_DYNAMIC' } }
        }
      } );

      expect( result ).toEqual( {
        googleSearch: { type: 'googleSearch', config: { mode: 'MODE_DYNAMIC' } }
      } );
    } );

    it( 'loads multiple tools with different configs', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: {
            googleSearch: { mode: 'MODE_DYNAMIC' },
            urlContext: {},
            fileSearch: { topK: 5 }
          }
        }
      } );

      expect( Object.keys( result ) ).toEqual( [ 'googleSearch', 'urlContext', 'fileSearch' ] );
      expect( result.googleSearch.config ).toEqual( { mode: 'MODE_DYNAMIC' } );
      expect( result.urlContext.config ).toEqual( {} );
      expect( result.fileSearch.config ).toEqual( { topK: 5 } );
    } );
  } );

  // Category 2: Vertex Provider (8 tests)
  describe( 'Vertex Provider', () => {
    it( 'loads googleSearch with mode and dynamicThreshold', () => {
      const result = loadTools( {
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

      expect( result.googleSearch ).toEqual( {
        type: 'googleSearch',
        config: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.8
        }
      } );
    } );

    it( 'loads fileSearch with fileSearchStoreNames and topK', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: {
            fileSearch: {
              fileSearchStoreNames: [ 'store-1', 'store-2' ],
              topK: 5,
              metadataFilter: 'category = "docs"'
            }
          }
        }
      } );

      expect( result.fileSearch.config ).toEqual( {
        fileSearchStoreNames: [ 'store-1', 'store-2' ],
        topK: 5,
        metadataFilter: 'category = "docs"'
      } );
    } );

    it( 'loads urlContext with empty config', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: { urlContext: {} }
        }
      } );

      expect( result.urlContext ).toEqual( {
        type: 'urlContext',
        config: {}
      } );
    } );

    it( 'loads enterpriseWebSearch with config', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: { enterpriseWebSearch: { threshold: 0.5 } }
        }
      } );

      expect( result.enterpriseWebSearch.config ).toEqual( { threshold: 0.5 } );
    } );

    it( 'loads googleMaps with config', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: { googleMaps: { region: 'US' } }
        }
      } );

      expect( result.googleMaps.config ).toEqual( { region: 'US' } );
    } );

    it( 'loads codeExecution with config', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: { codeExecution: { timeout: 30 } }
        }
      } );

      expect( result.codeExecution.config ).toEqual( { timeout: 30 } );
    } );

    it( 'loads vertexRagStore with config', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: {
            vertexRagStore: {
              ragCorpus: 'my-corpus-id',
              topK: 3
            }
          }
        }
      } );

      expect( result.vertexRagStore.config ).toEqual( {
        ragCorpus: 'my-corpus-id',
        topK: 3
      } );
    } );

    it( 'loads multiple Vertex tools simultaneously', () => {
      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: {
            googleSearch: { mode: 'MODE_DYNAMIC' },
            fileSearch: { topK: 5 },
            urlContext: {}
          }
        }
      } );

      expect( Object.keys( result ) ).toEqual( [ 'googleSearch', 'fileSearch', 'urlContext' ] );
      expect( result.googleSearch.type ).toBe( 'googleSearch' );
      expect( result.fileSearch.type ).toBe( 'fileSearch' );
      expect( result.urlContext.type ).toBe( 'urlContext' );
    } );
  } );

  // Category 3: OpenAI Provider (5 tests)
  describe( 'OpenAI Provider', () => {
    it( 'loads webSearch with empty config', () => {
      const result = loadTools( {
        config: {
          provider: 'openai',
          tools: { webSearch: {} }
        }
      } );

      expect( result.webSearch ).toEqual( {
        type: 'webSearch',
        config: {}
      } );
    } );

    it( 'loads webSearch with searchContextSize', () => {
      const result = loadTools( {
        config: {
          provider: 'openai',
          tools: {
            webSearch: { searchContextSize: 'high' }
          }
        }
      } );

      expect( result.webSearch.config.searchContextSize ).toBe( 'high' );
    } );

    it( 'loads webSearch with filters.allowedDomains array', () => {
      const result = loadTools( {
        config: {
          provider: 'openai',
          tools: {
            webSearch: {
              filters: {
                allowedDomains: [ 'wikipedia.org', 'github.com' ]
              }
            }
          }
        }
      } );

      expect( result.webSearch.config.filters.allowedDomains ).toEqual( [
        'wikipedia.org',
        'github.com'
      ] );
    } );

    it( 'loads webSearch with userLocation object', () => {
      const result = loadTools( {
        config: {
          provider: 'openai',
          tools: {
            webSearch: {
              userLocation: {
                type: 'approximate',
                country: 'US',
                city: 'San Francisco'
              }
            }
          }
        }
      } );

      expect( result.webSearch.config.userLocation ).toEqual( {
        type: 'approximate',
        country: 'US',
        city: 'San Francisco'
      } );
    } );

    it( 'loads webSearch with all config options combined', () => {
      const result = loadTools( {
        config: {
          provider: 'openai',
          tools: {
            webSearch: {
              searchContextSize: 'high',
              filters: {
                allowedDomains: [ 'wikipedia.org' ]
              },
              userLocation: {
                type: 'approximate',
                country: 'US'
              }
            }
          }
        }
      } );

      expect( result.webSearch.config.searchContextSize ).toBe( 'high' );
      expect( result.webSearch.config.filters.allowedDomains ).toHaveLength( 1 );
      expect( result.webSearch.config.userLocation.country ).toBe( 'US' );
    } );
  } );

  // Category 4: Anthropic Provider (6 tests)
  describe( 'Anthropic Provider', () => {
    it( 'loads webSearch_20250305 with empty config', () => {
      const result = loadTools( {
        config: {
          provider: 'anthropic',
          tools: { webSearch_20250305: {} }
        }
      } );

      expect( result.webSearch_20250305 ).toEqual( {
        type: 'webSearch_20250305',
        config: {}
      } );
    } );

    it( 'loads webSearch_20250305 with maxUses number', () => {
      const result = loadTools( {
        config: {
          provider: 'anthropic',
          tools: {
            webSearch_20250305: { maxUses: 3 }
          }
        }
      } );

      expect( result.webSearch_20250305.config.maxUses ).toBe( 3 );
    } );

    it( 'loads webSearch_20250305 with allowedDomains and blockedDomains', () => {
      const result = loadTools( {
        config: {
          provider: 'anthropic',
          tools: {
            webSearch_20250305: {
              allowedDomains: [ 'reuters.com', 'bbc.com' ],
              blockedDomains: [ 'tabloid.com' ]
            }
          }
        }
      } );

      expect( result.webSearch_20250305.config.allowedDomains ).toEqual( [
        'reuters.com',
        'bbc.com'
      ] );
      expect( result.webSearch_20250305.config.blockedDomains ).toEqual( [ 'tabloid.com' ] );
    } );

    it( 'loads webSearch_20250305 with userLocation object', () => {
      const result = loadTools( {
        config: {
          provider: 'anthropic',
          tools: {
            webSearch_20250305: {
              userLocation: {
                type: 'approximate',
                country: 'GB',
                city: 'London',
                timezone: 'Europe/London'
              }
            }
          }
        }
      } );

      expect( result.webSearch_20250305.config.userLocation.city ).toBe( 'London' );
      expect( result.webSearch_20250305.config.userLocation.timezone ).toBe( 'Europe/London' );
    } );

    it( 'loads bash_20241022 and bash_20250124 tools', () => {
      const result = loadTools( {
        config: {
          provider: 'anthropic',
          tools: {
            bash_20241022: {},
            bash_20250124: {}
          }
        }
      } );

      expect( result.bash_20241022.type ).toBe( 'bash_20241022' );
      expect( result.bash_20250124.type ).toBe( 'bash_20250124' );
    } );

    it( 'loads codeExecution_20250522 and codeExecution_20250825 tools', () => {
      const result = loadTools( {
        config: {
          provider: 'anthropic',
          tools: {
            codeExecution_20250522: {},
            codeExecution_20250825: {}
          }
        }
      } );

      expect( result.codeExecution_20250522.type ).toBe( 'codeExecution_20250522' );
      expect( result.codeExecution_20250825.type ).toBe( 'codeExecution_20250825' );
    } );
  } );

  // Category 5: Bedrock Provider (4 tests)
  describe( 'Bedrock Provider', () => {
    it( 'loads bash_20241022 tool', () => {
      const result = loadTools( {
        config: {
          provider: 'bedrock',
          tools: { bash_20241022: {} }
        }
      } );

      expect( result.bash_20241022 ).toEqual( {
        type: 'bash_20241022',
        config: {}
      } );
    } );

    it( 'loads textEditor_20241022 and textEditor_20250429 tools', () => {
      const result = loadTools( {
        config: {
          provider: 'bedrock',
          tools: {
            textEditor_20241022: {},
            textEditor_20250429: {}
          }
        }
      } );

      expect( result.textEditor_20241022.type ).toBe( 'textEditor_20241022' );
      expect( result.textEditor_20250429.type ).toBe( 'textEditor_20250429' );
    } );

    it( 'loads computer_20241022 with config', () => {
      const result = loadTools( {
        config: {
          provider: 'bedrock',
          tools: {
            computer_20241022: { displayWidthPx: 1024, displayHeightPx: 768 }
          }
        }
      } );

      expect( result.computer_20241022.config ).toEqual( {
        displayWidthPx: 1024,
        displayHeightPx: 768
      } );
    } );

    it( 'loads multiple Bedrock tools simultaneously', () => {
      const result = loadTools( {
        config: {
          provider: 'bedrock',
          tools: {
            bash_20241022: {},
            textEditor_20250429: {},
            computer_20241022: { displayWidthPx: 1920, displayHeightPx: 1080 }
          }
        }
      } );

      expect( Object.keys( result ) ).toEqual( [ 'bash_20241022', 'textEditor_20250429', 'computer_20241022' ] );
      expect( result.bash_20241022.type ).toBe( 'bash_20241022' );
      expect( result.textEditor_20250429.type ).toBe( 'textEditor_20250429' );
      expect( result.computer_20241022.type ).toBe( 'computer_20241022' );
    } );
  } );

  // Category 6: Error Handling (10 tests)
  describe( 'Error Handling', () => {
    it( 'throws clear error for array format (migration guide)', () => {
      expect( () => loadTools( {
        config: {
          provider: 'vertex',
          tools: [ 'googleSearch', 'urlContext' ]
        }
      } ) ).toThrow( 'tools must be an object with tool configurations, got array' );
    } );

    it( 'throws error for string format', () => {
      expect( () => loadTools( {
        config: {
          provider: 'vertex',
          tools: 'googleSearch'
        }
      } ) ).toThrow( 'tools must be an object' );
    } );

    it( 'throws error for number format', () => {
      expect( () => loadTools( {
        config: {
          provider: 'vertex',
          tools: 123
        }
      } ) ).toThrow( 'tools must be an object' );
    } );

    it( 'throws error for provider without tools support', () => {
      expect( () => loadTools( {
        config: {
          provider: 'azure',
          tools: { someTool: {} }
        }
      } ) ).toThrow( 'does not support provider-specific tools' );
    } );

    it( 'throws error for unknown tool on Vertex with dynamic tool listing', () => {
      expect( () => loadTools( {
        config: {
          provider: 'vertex',
          tools: { unknownTool: {} }
        }
      } ) ).toThrow( /Unknown tool "unknownTool" for provider "vertex".*Available tools:/ );
    } );

    it( 'throws error for unknown tool on OpenAI with dynamic tool listing', () => {
      expect( () => loadTools( {
        config: {
          provider: 'openai',
          tools: { googleSearch: {} }
        }
      } ) ).toThrow( /Unknown tool "googleSearch" for provider "openai".*Available tools:/ );
    } );

    it( 'throws error for unknown tool on Anthropic with dynamic tool listing', () => {
      expect( () => loadTools( {
        config: {
          provider: 'anthropic',
          tools: { googleSearch: {} }
        }
      } ) ).toThrow( /Unknown tool "googleSearch" for provider "anthropic".*Available tools:/ );
    } );

    it( 'throws error when tool config is null', () => {
      expect( () => loadTools( {
        config: {
          provider: 'vertex',
          tools: { googleSearch: null }
        }
      } ) ).toThrow( 'Configuration for tool "googleSearch" must be an object' );
    } );

    it( 'throws error when tool config is a string', () => {
      expect( () => loadTools( {
        config: {
          provider: 'vertex',
          tools: { googleSearch: 'MODE_DYNAMIC' }
        }
      } ) ).toThrow( 'Configuration for tool "googleSearch" must be an object' );
    } );

    it( 'throws error for unknown tool on Bedrock with dynamic tool listing', () => {
      expect( () => loadTools( {
        config: { provider: 'bedrock', tools: { webSearch: {} } }
      } ) ).toThrow( /Unknown tool "webSearch" for provider "bedrock".*Available tools:/ );
    } );
  } );

  // Category 7: Integration (3 tests)
  describe( 'Integration', () => {
    it( 'simulates variable interpolation scenario', () => {
      // Simulate what would come from renderPrompt + parsePrompt
      const renderedConfig = {
        provider: 'vertex',
        model: 'gemini-2.0-flash',
        tools: {
          googleSearch: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: 0.8
          }
        }
      };

      const result = loadTools( { config: renderedConfig } );

      expect( result.googleSearch.config ).toEqual( {
        mode: 'MODE_DYNAMIC',
        dynamicThreshold: 0.8
      } );
    } );

    it( 'validates that config objects are passed to factory functions', () => {
      const customConfig = {
        mode: 'MODE_DYNAMIC',
        dynamicThreshold: 0.7,
        customField: 'value'
      };

      const result = loadTools( {
        config: {
          provider: 'vertex',
          tools: { googleSearch: customConfig }
        }
      } );

      // The mock returns { type, config }, so we can verify config was passed through
      expect( result.googleSearch.config ).toEqual( customConfig );
    } );

    it( 'handles nested configuration objects', () => {
      const result = loadTools( {
        config: {
          provider: 'openai',
          tools: {
            webSearch: {
              searchContextSize: 'high',
              filters: {
                allowedDomains: [ 'example.com' ],
                blockedDomains: [ 'spam.com' ]
              },
              userLocation: {
                type: 'approximate',
                country: 'US',
                city: 'Seattle',
                region: 'WA'
              }
            }
          }
        }
      } );

      expect( result.webSearch.config.filters ).toBeDefined();
      expect( result.webSearch.config.userLocation ).toBeDefined();
      expect( result.webSearch.config.filters.allowedDomains ).toEqual( [ 'example.com' ] );
    } );
  } );
} );

describe( 'registerProvider', () => {
  afterEach( () => {
    for ( const key of Object.keys( providers ) ) {
      delete providers[key];
    }
    Object.assign( providers, builtInProviders );
  } );

  it( 'registers a custom provider and uses it in loadModel', () => {
    const customProvider = vi.fn( model => `custom:${model}` );
    registerProvider( 'custom', customProvider );

    const result = loadModel( { config: { provider: 'custom', model: 'my-model' } } );

    expect( result ).toBe( 'custom:my-model' );
    expect( customProvider ).toHaveBeenCalledWith( 'my-model' );
  } );

  it( 'overrides a built-in provider', () => {
    const overrideOpenai = vi.fn( model => `override:${model}` );
    registerProvider( 'openai', overrideOpenai );

    const result = loadModel( { config: { provider: 'openai', model: 'gpt-custom' } } );

    expect( result ).toBe( 'override:gpt-custom' );
  } );

  it( 'throws when name is empty string', () => {
    expect( () => registerProvider( '', vi.fn() ) ).toThrow( 'non-empty string' );
  } );

  it( 'throws when name is not a string', () => {
    expect( () => registerProvider( 123, vi.fn() ) ).toThrow( 'expected string, received number' );
  } );

  it( 'throws when providerFn is not a function', () => {
    expect( () => registerProvider( 'bad', 'not-a-function' ) ).toThrow( 'expected function, received string' );
  } );

  it( 'throws when providerFn is null', () => {
    expect( () => registerProvider( 'bad', null ) ).toThrow( 'expected function, received null' );
  } );
} );

describe( 'getRegisteredProviders', () => {
  afterEach( () => {
    for ( const key of Object.keys( providers ) ) {
      delete providers[key];
    }
    Object.assign( providers, builtInProviders );
  } );

  it( 'returns default providers', () => {
    const providers = getRegisteredProviders();

    expect( providers ).toContain( 'anthropic' );
    expect( providers ).toContain( 'openai' );
    expect( providers ).toContain( 'azure' );
    expect( providers ).toContain( 'vertex' );
    expect( providers ).toContain( 'bedrock' );
    expect( providers ).toContain( 'perplexity' );
  } );

  it( 'includes dynamically registered providers', () => {
    registerProvider( 'deepseek', vi.fn() );

    const providers = getRegisteredProviders();

    expect( providers ).toContain( 'deepseek' );
  } );
} );
