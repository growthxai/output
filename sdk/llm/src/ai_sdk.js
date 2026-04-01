import { loadModel, loadTools } from './ai_model.js';
import * as AI from 'ai';
import { stepCountIs } from 'ai';
import { validateGenerateTextArgs, validateStreamTextArgs } from './validations.js';
import { loadPrompt } from './prompt_loader.js';
import { buildSystemSkillsVar, buildLoadSkillTool, loadPromptSkills } from './skill.js';
import { startTrace, endTraceWithError, traceStreamCallbacks } from './trace_utils.js';
import { wrapInOutputResponse } from './response_utils.js';

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
    return wrapInOutputResponse( response, { traceId, modelId } );
  } catch ( error ) {
    endTraceWithError( traceId, error );
    throw error;
  }
}

export function streamText( { prompt, variables, onFinish, onError, ...restOptions } ) {
  validateStreamTextArgs( { prompt, variables } );
  const loadedPrompt = loadPrompt( prompt, variables );
  const traceId = startTrace( 'streamText', { prompt, variables, loadedPrompt } );
  const { model: modelId } = loadedPrompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkOptionsFromPrompt( loadedPrompt ),
      ...restOptions,
      ...traceStreamCallbacks( traceId, modelId, { onFinish, onError } )
    } );
  } catch ( error ) {
    endTraceWithError( traceId, error );
    throw error;
  }
}
