import { step, z } from '@outputai/core';
import { Agent, Output, generateText, skill } from '@outputai/llm';
import { reviewOutputSchema } from './types.js';

const audienceAdaptationSkill = skill( {
  name: 'audience_adaptation',
  description: 'Tailor feedback for the specified expertise level',
  instructions: `# Audience Adaptation

When the target audience is specified, adjust your feedback accordingly:

**Beginner audience**: Flag jargon and unexplained concepts as high-priority issues.
Prioritize clarity and step-by-step instructions over conciseness.

**Intermediate audience**: Balance clarity with depth. Flag gaps in conceptual explanation
but allow some assumed knowledge.

**Expert audience**: Focus on accuracy, completeness, and advanced concerns.
Basic explanations are unnecessary but architectural decisions should be justified.

Always mention the audience level in your summary.`
} );

const SKILLS = [ audienceAdaptationSkill ];

export const reviewContent = step( {
  name: 'reviewContent',
  description: 'Review technical content using the Agent class with structured output',
  inputSchema: z.object( {
    content: z.string().describe( 'The content to review' ),
    content_type: z.string().describe( 'Type of content (e.g. documentation, tutorial, README)' ),
    focus: z.string().describe( 'What aspects to focus the review on' )
  } ),
  outputSchema: reviewOutputSchema,
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      output: Output.object( { schema: reviewOutputSchema } ),
      skills: SKILLS,
      maxSteps: 5
    } );
    const result = await agent.generate();
    return result.output;
  }
} );

export const reviewContentFreeform = step( {
  name: 'reviewContentFreeform',
  description: 'Review technical content using the Agent class with free-form text output',
  inputSchema: z.object( {
    content: z.string().describe( 'The content to review' ),
    content_type: z.string().describe( 'Type of content (e.g. documentation, tutorial, README)' ),
    focus: z.string().describe( 'What aspects to focus the review on' )
  } ),
  outputSchema: z.string(),
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      skills: SKILLS,
      maxSteps: 5
    } );
    const result = await agent.generate();
    return result.text;
  }
} );

export const reviewContentGenerateText = step( {
  name: 'reviewContentGenerateText',
  description: 'Review technical content using generateText directly with skills',
  inputSchema: z.object( {
    content: z.string().describe( 'The content to review' ),
    content_type: z.string().describe( 'Type of content (e.g. documentation, tutorial, README)' ),
    focus: z.string().describe( 'What aspects to focus the review on' )
  } ),
  outputSchema: z.string(),
  fn: async input => {
    const result = await generateText( {
      prompt: 'writing_assistant@v1',
      variables: input,
      skills: SKILLS,
      maxSteps: 5
    } );
    return result.text;
  }
} );

export const reviewContentNoSkills = step( {
  name: 'reviewContentNoSkills',
  description: 'Review content using a prompt with skills: [] — confirms no skills are loaded',
  inputSchema: z.object( {
    content: z.string().describe( 'The content to review' ),
    content_type: z.string().describe( 'Type of content (e.g. documentation, tutorial, README)' ),
    focus: z.string().describe( 'What aspects to focus the review on' )
  } ),
  outputSchema: z.string(),
  fn: async input => {
    const agent = new Agent( {
      prompt: 'no_skills_assistant@v1',
      variables: input
    } );
    const result = await agent.generate();
    return result.text;
  }
} );
