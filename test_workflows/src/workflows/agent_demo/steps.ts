import { step, z } from '@outputai/core';
import { agent, skill } from '@outputai/llm';
import { reviewOutputSchema } from './types.js';

// Inline skill defined programmatically (shown alongside file-based skills from prompts/)
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

// The writing assistant agent - wraps generateText with skills and structured output.
// Skills from ./skills/ directory are declared in the prompt frontmatter and validated
// at module load time. The audience_adaptation skill is added dynamically at runtime.
const writingAssistant = agent( {
  name: 'writing_assistant',
  prompt: 'writing_assistant@v1',
  outputSchema: reviewOutputSchema,
  // Dynamic skills: always include audience_adaptation
  // (demonstrates the skills function argument)
  skills: () => [ audienceAdaptationSkill ],
  maxSteps: 5
} );

export const reviewContent = step( {
  name: 'reviewContent',
  description: 'Review technical content using the writing assistant agent',
  inputSchema: z.object( {
    content: z.string().describe( 'The content to review' ),
    content_type: z.string().describe( 'Type of content (e.g. documentation, tutorial, README)' ),
    focus: z.string().describe( 'What aspects to focus the review on' )
  } ),
  outputSchema: reviewOutputSchema,
  fn: async input => {
    const result = await writingAssistant( input );
    return result.output;
  }
} );
