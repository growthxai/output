import { loadPrompt } from './loader.js';
import { buildSystemSkillsVar, buildLoadSkillTool, resolvePromptSkills } from './skill.js';

export const prepareTextPrompt = ( { prompt, variables, promptDir, skills, tools } ) => {
  const loadedPrompt = loadPrompt( prompt, variables, promptDir );

  const resolvedSkills = resolvePromptSkills( loadedPrompt, skills );

  const result = { loadedPrompt, tools: tools ? { ...tools } : null };

  if ( resolvedSkills.length > 0 ) {
    result.tools = {
      load_skill: buildLoadSkillTool( resolvedSkills ),
      ...( result.tools ?? {} )
    };

    const skillsMessage = { role: 'system', content: buildSystemSkillsVar( resolvedSkills ) };
    const systemMessage = loadedPrompt.messages.find( m => m.role === 'system' );
    if ( systemMessage ) {
      systemMessage.content = `${systemMessage.content}\n\n${skillsMessage.content}`;
    } else {
      loadedPrompt.messages.unshift( skillsMessage );
    }
  }

  return result;
};
