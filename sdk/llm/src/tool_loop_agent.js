import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import * as AI from 'ai';
import { stepCountIs } from 'ai';
import { hydratePromptTemplate, loadAiSdkOptionsFromPrompt } from './ai_sdk.js';
import { buildLoadSkillTool } from './skill.js';

/**
 * Create a reusable agent backed by AI SDK's ToolLoopAgent, with Output.ai prompt file
 * and skill support.
 *
 * Accepts the same options as AI SDK's ToolLoopAgent, with `prompt` replacing `model` +
 * `instructions` and `skills` added for the Output.ai skill system.
 *
 * @param {object} params
 * @param {string} params.prompt - Prompt file name (e.g. 'my_agent@v1')
 * @param {string} [params.promptDir] - Override the stack-resolved prompt directory
 * @param {import('./skill.js').SkillsArg} [params.skills] - Inline skills or function returning skills
 * @param {object} [params.tools] - AI SDK tools available during the reasoning loop
 * @param {number} [params.maxSteps=10] - Convenience alias for stepCountIs(n) when stopWhen not set
 * @param {import('ai').StopCondition | import('ai').StopCondition[]} [params.stopWhen]
 * @param {...*} rest - Any other AI SDK ToolLoopAgent constructor options passed through
 * @returns {{ generate: Function, stream: Function }}
 */
export function ToolLoopAgent( {
  prompt,
  promptDir,
  skills = [],
  tools = {},
  stopWhen,
  maxSteps = 10,
  ...rest
} ) {
  if ( !prompt ) {
    throw new ValidationError( 'ToolLoopAgent requires a prompt' );
  }

  // Must be captured synchronously at factory-call time — Temporal async activity
  // execution breaks the call stack, so resolveInvocationDir() fails if called lazily.
  const resolvedPromptDir = promptDir ?? resolveInvocationDir();
  const resolvedStopWhen = stopWhen ?? stepCountIs( maxSteps );

  const _buildInnerAgent = ( loadedPrompt, resolvedSkills ) => {
    const { messages, ...constructorOptions } = loadAiSdkOptionsFromPrompt( loadedPrompt );
    const mergedTools = resolvedSkills.length > 0 ?
      { load_skill: buildLoadSkillTool( resolvedSkills ), ...tools } :
      tools;
    const innerAgent = new AI.ToolLoopAgent( {
      ...constructorOptions,
      ...( Object.keys( mergedTools ).length > 0 ? { tools: mergedTools } : {} ),
      stopWhen: resolvedStopWhen,
      ...rest
    } );
    return { innerAgent, messages };
  };

  return {
    async generate( { variables, messages: extraMessages = [], ...callOptions } = {} ) {
      const callerSkills = typeof skills === 'function' ? await skills( variables ) : skills;
      const { loadedPrompt, resolvedSkills } = hydratePromptTemplate(
        prompt, variables, resolvedPromptDir, callerSkills
      );
      const { innerAgent, messages } = _buildInnerAgent( loadedPrompt, resolvedSkills );
      return innerAgent.generate( { messages: [ ...messages, ...extraMessages ], ...callOptions } );
    },

    stream( { variables, messages: extraMessages = [], ...callOptions } = {} ) {
      if ( typeof skills === 'function' ) {
        throw new ValidationError( 'ToolLoopAgent.stream() does not support async skill functions' );
      }
      const { loadedPrompt, resolvedSkills } = hydratePromptTemplate(
        prompt, variables, resolvedPromptDir, skills
      );
      const { innerAgent, messages } = _buildInnerAgent( loadedPrompt, resolvedSkills );
      return innerAgent.stream( { messages: [ ...messages, ...extraMessages ], ...callOptions } );
    }
  };
}
