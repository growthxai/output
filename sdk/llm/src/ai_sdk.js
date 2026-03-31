import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';
import { loadModel, loadTools } from './ai_model.js';
import * as AI from 'ai';
import { stepCountIs } from 'ai';
import { validateGenerateTextArgs, validateStreamTextArgs } from './validations.js';
import { loadPrompt } from './prompt_loader.js';
import { buildSystemSkillsVar, buildLoadSkillTool, loadPromptSkills } from './skill.js';
import { extractSourcesFromSteps } from './source_extraction.js';
import { calculateLLMCallCost } from './cost/index.js';

// Starts the LLM trace, with the start event
const startTrace = ( name, details ) => {
  const traceId = `${name}-${Date.now()}`;
  Tracing.addEventStart( { kind: 'llm', name, id: traceId, details } );
  return traceId;
};

export const loadAiSdkOptionsFromPrompt = prompt => {
  const options = {
    model: loadModel( prompt ),
    messages: prompt.messages,
    providerOptions: prompt.config.providerOptions
  };

  if ( Number.isFinite( prompt.config.temperature ) ) {
    options.temperature = prompt.config.temperature;
  }

  if ( prompt.config.maxTokens ) {
    options.maxOutputTokens = prompt.config.maxTokens;
  }

  const tools = loadTools( prompt );
  if ( tools ) {
    options.tools = tools;
  }

  return options;
};

/**
 * Use an LLM model to generate text.
 *
 * Accepts additional AI SDK options (tools, maxRetries, seed, etc.) that are passed through
 * to the underlying provider. Options from the prompt file can be overridden at call time.
 *
 * @param {object} args - Generation arguments
 * @param {string} args.prompt - Prompt file name
 * @param {Record<string, string | number>} [args.variables] - Variables to interpolate
 * @param {object} [args.tools] - AI SDK tools the model can call
 * @param {'auto'|'none'|'required'|object} [args.toolChoice] - Tool selection strategy
 * @param {number} [args.maxRetries] - Max retry attempts (default: 2)
 * @param {number} [args.seed] - Seed for deterministic output
 * @param {AbortSignal} [args.abortSignal] - Signal to abort the request
 * @throws {ValidationError} If the prompt config is invalid (e.g., snake_case fields)
 * @throws {FatalError} If the prompt file is not found or template rendering fails
 * @returns {Promise<GenerateTextResult>} AI SDK response with text, toolCalls, and metadata
 */
export const hydratePromptTemplate = ( prompt, variables, promptDir, callerSkills, callerTools = {} ) => {
  const meta = loadPrompt( prompt, variables, promptDir );
  const frontmatterSkills = meta.config.skills && meta.promptFileDir ?
    loadPromptSkills( meta.config.skills, meta.promptFileDir ) :
    [];
  const resolvedSkills = [ ...frontmatterSkills, ...callerSkills ];

  const tools = resolvedSkills.length > 0 ?
    { load_skill: buildLoadSkillTool( resolvedSkills ), ...callerTools } :
    callerTools;

  if ( resolvedSkills.length === 0 ) {
    return { loadedPrompt: meta, allVariables: variables, tools };
  }
  const allVariables = { ...variables, _system_skills: buildSystemSkillsVar( resolvedSkills ) };
  return { loadedPrompt: loadPrompt( prompt, allVariables, promptDir ), allVariables, tools };
};

export async function generateText( { prompt, variables, promptDir, skills = [], maxSteps = 10, ...extraAiSdkOptions } ) {
  const callerSkills = typeof skills === 'function' ? await skills( variables ) : skills;
  const { loadedPrompt, allVariables, tools } =
    hydratePromptTemplate( prompt, variables, promptDir, callerSkills, extraAiSdkOptions.tools );
  const hasTools = Object.keys( tools ).length > 0;

  validateGenerateTextArgs( { prompt, variables: allVariables } );

  const traceId = startTrace( 'generateText', { prompt, variables: allVariables, loadedPrompt } );
  const { model: modelId } = loadedPrompt.config;

  try {
    const response = await AI.generateText( {
      ...loadAiSdkOptionsFromPrompt( loadedPrompt ),
      ...extraAiSdkOptions,
      ...( hasTools ? { tools } : {} ),
      ...( hasTools && !extraAiSdkOptions.stopWhen ? { stopWhen: stepCountIs( maxSteps ) } : {} )
    } );
    const { text: result, totalUsage: usage, providerMetadata } = response;
    const sourcesFromTools = extractSourcesFromSteps( response.steps );
    const cost = await calculateLLMCallCost( { usage, modelId } );

    emitEvent( 'llm:call_cost', { modelId, cost, usage } );
    Tracing.addEventEnd( { id: traceId, details: { result, usage, cost, providerMetadata, sourcesFromTools } } );

    // Creates a proxy over the response from AI SDK to add
    // - result: a shortcut for the actual SDK response (eg. .text);
    // - sources: a way to retrieve the computed sources;
    // It uses proxies instead of spreading the response object because AI SDK uses getters
    // (and they don't deconstruct properly in JS).
    return new Proxy( response, {
      get( target, prop, receiver ) {
        if ( prop === 'result' ) {
          return target.text;
        }
        if ( prop === 'sources' && sourcesFromTools.length > 0 ) {
          const responseSources = Array.isArray( target[prop] ) ? target[prop] : [];
          const byUrl = new Map( [ ...sourcesFromTools, ...responseSources ].map( s => [ s.url, s ] ) );
          return [ ...byUrl.values() ];
        }
        return Reflect.get( target, prop, receiver );
      }
    } );
  } catch ( error ) {
    Tracing.addEventError( { id: traceId, details: error } );
    throw error;
  }
}

/**
 * Use an LLM model to stream text generation.
 *
 * Accepts additional AI SDK options (tools, onChunk, onFinish, onError, etc.) that are passed
 * through to the underlying provider. Options from the prompt file can be overridden at call time.
 *
 * @param {object} args - Generation arguments
 * @param {string} args.prompt - Prompt file name
 * @param {Record<string, string | number>} [args.variables] - Variables to interpolate
 * @param {object} [args.tools] - AI SDK tools the model can call
 * @param {'auto'|'none'|'required'|object} [args.toolChoice] - Tool selection strategy
 * @param {number} [args.maxRetries] - Max retry attempts (default: 2)
 * @param {AbortSignal} [args.abortSignal] - Signal to abort the request
 * @param {Function} [args.onChunk] - Callback for each stream chunk
 * @param {Function} [args.onFinish] - Callback when stream finishes (called after internal tracing)
 * @param {Function} [args.onError] - Callback when stream errors (called after internal tracing)
 * @throws {ValidationError} If required arguments are missing or prompt file has invalid config
 * @throws {FatalError} If the prompt file is not found or template rendering fails
 * @returns {AIStreamTextResult} AI SDK stream result with textStream, fullStream, and metadata promises (synchronous)
 */
export function streamText( { prompt, variables, onFinish: userOnFinish, onError: userOnError, ...restOptions } ) {
  validateStreamTextArgs( { prompt, variables } );
  const loadedPrompt = loadPrompt( prompt, variables );
  const traceId = startTrace( 'streamText', { prompt, variables, loadedPrompt } );
  const { model: modelId } = loadedPrompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkOptionsFromPrompt( loadedPrompt ),
      ...restOptions,
      async onFinish( response ) {
        const { text: result, totalUsage: usage, providerMetadata } = response;
        const cost = await calculateLLMCallCost( { usage, modelId } );
        emitEvent( 'llm:call_cost', { modelId, cost, usage } );
        Tracing.addEventEnd( { id: traceId, details: { result, usage, cost, providerMetadata } } );
        userOnFinish?.( response );
      },
      onError( event ) {
        Tracing.addEventError( { id: traceId, details: event.error } );
        userOnError?.( event );
      }
    } );
  } catch ( error ) {
    Tracing.addEventError( { id: traceId, details: error } );
    throw error;
  }
}
