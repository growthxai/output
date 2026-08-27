import { loadImageModel, loadTextModel } from './utils/models.js';
import { buildLoadSkillTool, loadPromptTools } from './utils/tools.js';
import { Role } from './consts.js';
import { FatalError } from '@outputai/core';
import { stepCountIs } from 'ai';

const buildSkillsMessageContent = skills =>
  'Available skills (use load_skill to get full instructions):\n' +
  skills.map( s => `- ${s.name}: ${s.description}` ).join( '\n' );

const textPromptConfigKeys = [
  'frequencyPenalty',
  'maxOutputTokens',
  'presencePenalty',
  'providerOptions',
  'seed',
  'stopSequences',
  'temperature',
  'topK',
  'topP'
];

const imagePromptConfigKeys = [
  'aspectRatio',
  'maxImagesPerCall',
  'n',
  'providerOptions',
  'seed',
  'size'
];

const select = ( keys, target ) =>
  Object.fromEntries( Object.entries( target ).filter( ( [ k, v ] ) => keys.includes( k ) && v !== undefined ) );

/**
 * Build options for AI SDK text generation.
 *
 * Splits system vs chat messages, applies prompt generation config, and merges tools
 * with a step limit when any tools are present. Always sets `maxRetries` to 0.
 *
 * @param {object} args
 * @param {object} args.prompt - Loaded prompt object
 * @param {object} [args.tools] - Caller tools
 * @param {Skill[]} args.skills - Resolved skills
 * @param {unknown} [args.stopWhen] - Caller stop condition; otherwise prompt `maxSteps` when tools exist
 * @param {unknown} [args.output] - Structured output spec
 * @param {unknown} [args.toolChoice] - Tool choice, set only when tools exist
 * @param {AbortSignal} [args.abortSignal] - Abort signal for the request
 * @returns {object} AI SDK text options
 */
export const loadAiSdkTextOptions = ( { prompt, tools, skills, stopWhen, output, toolChoice, abortSignal } ) => {
  if ( prompt.messages.length === 0 ) {
    throw new FatalError( `Prompt "${prompt.name}" has no chat-style messages. Add role-tagged blocks like <system> or <user>.` );
  }

  const systemMessages = prompt.messages.filter( m => m.role === Role.SYSTEM );
  const allMessages = prompt.messages.filter( m => m.role !== Role.SYSTEM );

  if ( skills.length > 0 ) {
    const skillsMessageContent = buildSkillsMessageContent( skills );
    if ( systemMessages.length > 0 ) {
      systemMessages[0] = { ...systemMessages[0], content: `${systemMessages[0].content}\n\n${skillsMessageContent}` };
    } else {
      systemMessages.push( { role: Role.SYSTEM, content: skillsMessageContent } );
    }
  }

  const options = {
    allowSystemInMessages: true,
    maxRetries: 0,
    model: loadTextModel( prompt ),
    system: systemMessages,
    messages: allMessages,
    ...( output && { output } ),
    ...( abortSignal && { abortSignal } ),
    ...( stopWhen && { stopWhen } ),
    // @TEMP maxTokens is deprecated in favor of native maxOutputTokens
    ...( Number.isFinite( prompt.config.maxTokens ) && { maxOutputTokens: prompt.config.maxTokens } ),
    ...select( textPromptConfigKeys, prompt.config )
  };

  // Tools parsing
  const promptTools = loadPromptTools( prompt );
  const skillsTools = skills.length > 0 ? { load_skill: buildLoadSkillTool( skills ) } : {};
  const mergedTools = { ...promptTools, ...tools, ...skillsTools };
  if ( Object.keys( mergedTools ).length > 0 ) {
    options.tools = mergedTools;
    if ( toolChoice ) {
      options.toolChoice = toolChoice;
    }
    if ( !options.stopWhen ) {
      options.stopWhen = stepCountIs( prompt.config.maxSteps );
    }
  }

  return options;
};

/**
 * Build options for AI SDK image generation.
 *
 * Uses prompt instructions (with optional source images and mask) and prompt-owned
 * image config (`n`, `size`, `aspectRatio`, `seed`, `maxImagesPerCall`, `providerOptions`).
 * Always sets `maxRetries` to 0.
 *
 * @param {object} args
 * @param {object} args.prompt - Loaded prompt object
 * @param {unknown} [args.images] - Source images for image-to-image
 * @param {unknown} [args.mask] - Inpainting mask
 * @param {AbortSignal} [args.abortSignal] - Abort signal for the request
 * @returns {object} AI SDK image options
 */
export const loadAiSdkImageOptions = ( { prompt, images, mask, abortSignal } ) => {
  if ( !prompt.instructions ) {
    throw new FatalError( `Prompt "${prompt.name}" has no instructions. Image prompts must use plain instructions.` );
  }
  return {
    maxRetries: 0,
    model: loadImageModel( prompt ),
    prompt: ( images || mask ) ? {
      text: prompt.instructions,
      ...( images && { images } ),
      ...( mask && { mask } )
    } : prompt.instructions,
    ...( abortSignal && { abortSignal } ),
    ...select( imagePromptConfigKeys, prompt.config )
  };
};
