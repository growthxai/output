import type { ToolSet } from 'ai';
import type { SkillsArg } from './skill.js';
import type { generateText } from './ai_sdk.js';

export { skill } from './skill.js';
export type { Skill, SkillsArg } from './skill.js';

/**
 * Create a reusable agent function that composes generateText() with skills and tools.
 *
 * The returned function is a plain async function — wrap it in step() for Temporal durability.
 *
 * Skills declared in the prompt's YAML frontmatter (`skills: [...]`) are merged with any skills
 * passed via the `skills` argument at runtime.
 *
 * The `_system_skills` template variable is automatically injected when skills are present.
 * Include `{{ _system_skills }}` in your system message to expose available skills to the LLM.
 *
 * @example
 * ```ts
 * const researchAgent = agent( {
 *   name: 'research_agent',
 *   prompt: 'research@v1',
 *   tools: { search: tavilySearch() },
 *   skills: [ researchSkill ],
 *   outputSchema: z.object( { summary: z.string() } ),
 * } );
 *
 * export const runResearch = step( {
 *   name: 'run_research',
 *   fn: async input => {
 *     const result = await researchAgent( input );
 *     return result.output;
 *   },
 * } );
 * ```
 */
export declare function agent<Input = unknown>( params: {
  /** Agent identifier */
  name: string;
  /** Prompt file name (e.g. 'my_agent@v1') */
  prompt: string;
  /** Override the stack-resolved prompt directory (useful in tests) */
  promptDir?: string;
  /** AI SDK tools available during the LLM reasoning loop */
  tools?: ToolSet;
  /**
   * Inline skill packages or a function that produces skills from the agent's input.
   * Merged with any skills declared in the prompt's YAML frontmatter.
   */
  skills?: SkillsArg<Input>;
  /** Zod schema for structured output — drives Output.object() passed to generateText */
  outputSchema?: unknown;
  /** Maximum tool-loop iterations (default: 10) */
  maxSteps?: number;
} ): ( input: Input ) => ReturnType<typeof generateText>;
