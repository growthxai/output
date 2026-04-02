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

/** Load a single skill from a markdown file. */
export declare function loadSkillFile( filePath: string ): Skill;

/** Load skills from an array of file/directory paths, resolved relative to promptDir. */
export declare function loadPromptSkills( skillPaths: string | string[], promptDir: string ): Skill[];

/** Build the `{{ _system_skills }}` template variable listing available skills. */
export declare function buildSystemSkillsVar( skills: Skill[] ): string;

/** Build the `load_skill` AI SDK tool that returns full instructions for a named skill. */
export declare function buildLoadSkillTool( skills: Skill[] ): import( 'ai' ).Tool;
