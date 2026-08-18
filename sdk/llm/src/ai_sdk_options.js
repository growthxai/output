import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';
import { resolveMessageProviderOptions } from './prompt/block_options.js';
import { buildLoadSkillTool } from './utils/tools.js';
import { ROLE, isRole } from './utils/message.js';
import { FatalError } from '@outputai/core';
import { stepCountIs } from 'ai';

const buildSkillsMessageContent = skills =>
  'Available skills (use load_skill to get full instructions):\n' +
  skills.map( s => `- ${s.name}: ${s.description}` ).join( '\n' );

/**
 * Build options for AI SDK text generation.
 *
 * Returns `system` and `messages` split by role, generation config, and merged tools
 * with a step limit when any tools are present.
 *
 * @param {object} args
 * @param {object} args.prompt - Prompt object
 * @param {object} [args.tools] - Caller tools
 * @param {Skill[]} args.skills - Resolved skills
 * @param {number} args.maxSteps - Tool-loop step limit
 * @returns {object} AI SDK text options
 */
export const loadAiSdkTextOptions = ( { prompt, tools, skills, maxSteps } ) => {
  if ( prompt.messages.length === 0 ) {
    throw new FatalError( `Prompt "${prompt.name}" has no chat-style messages. Add role-tagged blocks like <system> or <user>.` );
  }
  const isSystem = isRole( ROLE.SYSTEM );
  const resolvedMessages = resolveMessageProviderOptions( prompt );

  const systemMessages = resolvedMessages.filter( isSystem );
  const allMessages = resolvedMessages.filter( m => !isSystem( m ) );

  if ( skills.length > 0 ) {
    const skillsMessageContent = buildSkillsMessageContent( skills );
    if ( systemMessages.length > 0 ) {
      systemMessages[0] = { ...systemMessages[0], content: `${systemMessages[0].content}\n\n${skillsMessageContent}` };
    } else {
      systemMessages.push( { role: ROLE.SYSTEM, content: skillsMessageContent } );
    }
  }

  const options = {
    model: loadTextModel( prompt ),
    system: systemMessages,
    messages: allMessages,
    providerOptions: prompt.config.providerOptions
  };

  if ( Number.isFinite( prompt.config.temperature ) ) {
    options.temperature = prompt.config.temperature;
  }

  if ( prompt.config.maxTokens ) {
    options.maxOutputTokens = prompt.config.maxTokens;
  }

  const promptTools = loadTools( prompt );
  const skillsTools = skills.length > 0 ? { load_skill: buildLoadSkillTool( skills ) } : {};
  const mergedTools = { ...promptTools, ...tools, ...skillsTools };
  if ( Object.keys( mergedTools ).length > 0 ) {
    options.tools = mergedTools;
    options.stopWhen = stepCountIs( maxSteps );
  }

  return options;
};

/**
 * Build options for AI SDK image generation.
 *
 * Returns the image model, instructions (with optional source images and mask), and
 * image-specific config.
 *
 * @param {object} args
 * @param {object} args.prompt - Prompt object
 * @param {unknown} [args.images] - Source images
 * @param {unknown} [args.mask] - Inpainting mask
 * @returns {object} AI SDK image options
 */
export const loadAiSdkImageOptions = ( { prompt, images, mask } ) => {
  if ( !prompt.instructions ) {
    throw new FatalError( `Prompt "${prompt.name}" has no instructions. Image prompts must use plain instructions.` );
  }
  const options = {
    model: loadImageModel( prompt ),
    prompt: ( images || mask ) ? {
      text: prompt.instructions,
      ...( images && { images } ),
      ...( mask && { mask } )
    } : prompt.instructions,
    providerOptions: prompt.config.providerOptions
  };
  for ( const key of [ 'n', 'maxImagesPerCall', 'size', 'aspectRatio', 'seed' ] ) {
    if ( prompt.config[key] !== undefined ) {
      options[key] = prompt.config[key];
    }
  }
  return options;
};
