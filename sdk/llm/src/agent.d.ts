import type { ToolSet } from 'ai';
import type { z } from 'zod';

/**
 * An instruction package that an agent can load on demand via the load_skill tool.
 *
 * Skills are declared in prompt frontmatter (as file paths) or passed inline
 * to agent(). The LLM sees skill names and descriptions in `{{ _system_skills }}`
 * and calls `load_skill` to retrieve full instructions when needed.
 */
export type Skill = {
  name: string;
  description: string;
  instructions: string;
};

/**
 * The skills argument for agent(). Either a static list or a function
 * that receives the agent's input and returns skills dynamically.
 */
export type SkillsArg<Input = unknown> = Skill[] |
  ( ( input: Input ) => Skill[] | Promise<Skill[]> );

/**
 * Create an inline skill instruction package.
 *
 * @example
 * ```ts
 * const researchSkill = skill( {
 *   name: 'web_research',
 *   description: 'Search and synthesize web information',
 *   instructions: '# Web Research\n1. Break into queries\n2. Search\n3. Cite sources'
 * } );
 * ```
 */
export declare function skill( params: {
  name: string;
  description?: string;
  instructions: string;
} ): Skill;

/**
 * Create a reusable agent function that composes generateText() with skills and tools.
 *
 * The returned function is a plain async function — wrap it in step() for Temporal durability.
 *
 * Skills declared in the prompt's YAML frontmatter (`skills: [...]`) are validated at
 * agent() definition time (module load = worker startup) and merged with any skills
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
 *   fn: async input => researchAgent( input ),
 * } );
 * ```
 */
export declare function agent<
  Input = unknown,
  OutputSchema extends z.ZodTypeAny | undefined = undefined
>( params: {
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
  /** Zod schema for structured output. When provided, returns typed object instead of string. */
  outputSchema?: OutputSchema;
  /** Maximum tool-loop iterations (default: 10) */
  maxSteps?: number;
} ): (
  input: Input
) => Promise<OutputSchema extends z.ZodTypeAny ? z.infer<OutputSchema> : string>;
