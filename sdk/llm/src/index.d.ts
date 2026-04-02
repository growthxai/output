import type {
  GenerateTextResult as AIGenerateTextResult,
  StreamTextResult as AIStreamTextResult,
  CallSettings,
  ToolSet,
  ToolChoice,
  StopCondition,
  GenerateTextOnStepFinishCallback,
  StreamTextOnStepFinishCallback,
  StreamTextTransform,
  PrepareStepFunction,
  StreamTextOnChunkCallback,
  StreamTextOnFinishCallback,
  StreamTextOnErrorCallback
} from 'ai';
import type { Output as AIOutput } from 'ai';

/**
 * Represents a single message in a prompt conversation.
 *
 * @example
 * ```ts
 * const msg: PromptMessage = {
 *   role: 'user',
 *   content: 'Hello, Claude!'
 * };
 * ```
 */
export type PromptMessage = {
  /** The role of the message. Examples include 'system', 'user', and 'assistant'. */
  role: string;
  /** The content of the message */
  content: string;
};

/**
 * Configuration for LLM prompt generation.
 *
 * @example
 * ```ts
 * const prompt: Prompt = {
 *   name: 'summarizePrompt',
 *   config: {
 *     provider: 'anthropic',
 *     model: 'claude-opus-4-1',
 *     temperature: 0.7,
 *     maxTokens: 2048
 *   },
 *   messages: [...]
 * };
 * ```
 */
export type Prompt = {
  /** Name of the prompt file */
  name: string;

  /** General configuration for the LLM */
  config: {
    /** LLM provider (built-in: 'anthropic', 'openai', 'azure', 'vertex', 'bedrock', 'perplexity'; or any registered custom provider) */
    provider: string;

    /** Model name/identifier */
    model: string;

    /** Generation temperature (0-2). Lower = more deterministic */
    temperature?: number;

    /** Maximum number of tokens in the response */
    maxTokens?: number;

    /**
     * Provider-specific tools with configuration.
     *
     * @example Vertex googleSearch with config
     * ```yaml
     * tools:
     *   googleSearch:
     *     mode: MODE_DYNAMIC
     *     dynamicThreshold: 0.8
     * ```
     *
     * @example OpenAI webSearch with filters
     * ```yaml
     * tools:
     *   webSearch:
     *     searchContextSize: high
     *     filters:
     *       allowedDomains: [wikipedia.org]
     * ```
     */
    tools?: Record<string, Record<string, unknown>>;

    /** Provider-specific options */
    providerOptions?: Record<string, unknown>;
  };

  /** Array of messages in the conversation */
  messages: PromptMessage[];
};

// Re-export AI SDK types directly (auto-synced with AI SDK updates)
export type {
  LanguageModelUsage,
  FinishReason,
  LanguageModelResponseMetadata,
  ProviderMetadata,
  CallWarning,
  Warning,
  CallSettings,
  ToolSet,
  ToolChoice,
  Tool,
  StopCondition,
  StepResult,
  GenerateTextOnStepFinishCallback,
  PrepareStepFunction,
  PrepareStepResult,
  StreamTextOnChunkCallback,
  StreamTextOnFinishCallback,
  StreamTextOnErrorCallback,
  StreamTextTransform,
  TextStreamPart
} from 'ai';

// Re-export the tool helper function, Output, smoothStream, and stop condition helpers
export { tool, Output, smoothStream, stepCountIs, hasToolCall } from 'ai';

// Web search tool factories
export { tavilySearch, tavilyExtract, tavilyCrawl, tavilyMap } from '@tavily/ai-sdk';
export { webSearch as exaSearch } from '@exalabs/ai-sdk';
export { perplexitySearch } from '@perplexity-ai/ai-sdk';

/**
 * Common AI SDK options that can be passed through to all generate functions.
 * These options are passed directly to the underlying AI SDK call.
 */
type AiSdkOptions = Partial<Omit<CallSettings, 'maxOutputTokens'>>;

/**
 * AI SDK options specific to generateText, including tool calling and multi-step support.
 * @typeParam Tools - The tools available for the model to call
 */
type GenerateTextAiSdkOptions<
  Tools extends ToolSet = ToolSet,
  Output extends AIOutput<unknown, unknown> = AIOutput<unknown, unknown>
> = AiSdkOptions & {
  /** Tools the model can call */
  tools?: Tools;
  /** Tool choice strategy: 'auto', 'none', 'required', or specific tool */
  toolChoice?: ToolChoice<Tools>;
  /** Limit which tools are active without changing types */
  activeTools?: Array<keyof Tools>;
  /** Maximum number of automatic tool execution rounds (multi-step) */
  maxSteps?: number;
  /** Custom stop conditions for multi-step execution */
  stopWhen?: StopCondition<Tools> | StopCondition<Tools>[];
  /** Callback after each step completes */
  onStepFinish?: GenerateTextOnStepFinishCallback<Tools>;
  /** Customize each step before execution */
  prepareStep?: PrepareStepFunction<Tools>;
  /** Structured output specification (e.g., Output.object({ schema })) */
  output?: Output;
};

/**
 * AI SDK options specific to streamText, including tool calling, multi-step, and streaming callbacks.
 * @typeParam Tools - The tools available for the model to call
 */
type StreamTextAiSdkOptions<
  Tools extends ToolSet = ToolSet,
  Output extends AIOutput<unknown, unknown> = AIOutput<unknown, unknown>
> = AiSdkOptions & {
  /** Tools the model can call */
  tools?: Tools;
  /** Tool choice strategy: 'auto', 'none', 'required', or specific tool */
  toolChoice?: ToolChoice<Tools>;
  /** Limit which tools are active without changing types */
  activeTools?: Array<keyof Tools>;
  /** Maximum number of automatic tool execution rounds (multi-step) */
  maxSteps?: number;
  /** Custom stop conditions for multi-step execution */
  stopWhen?: StopCondition<Tools> | StopCondition<Tools>[];
  /** Callback after each step completes */
  onStepFinish?: StreamTextOnStepFinishCallback<Tools>;
  /** Customize each step before execution */
  prepareStep?: PrepareStepFunction<Tools>;
  /** Structured output specification (e.g., Output.object({ schema })) */
  output?: Output;
  /** Callback for each stream chunk */
  onChunk?: StreamTextOnChunkCallback<Tools>;
  /** Callback when stream finishes. Called after internal tracing records the result. */
  onFinish?: StreamTextOnFinishCallback<Tools>;
  /** Callback when stream errors. Called after internal tracing records the error. */
  onError?: StreamTextOnErrorCallback;
  /** Stream transformation (e.g., smoothStream()) */
  experimental_transform?: StreamTextTransform<Tools> | Array<StreamTextTransform<Tools>>;
};

/** A source extracted from search tool results during multi-step LLM execution. */
export type ExtractedSource = {
  type: 'source';
  sourceType: 'url';
  id: string;
  url: string;
  title: string;
};

/**
 * Result from generateText including full AI SDK response metadata.
 * Extends AI SDK's GenerateTextResult with a unified `result` field.
 * @typeParam Tools - The tools available for the model to call (preserves typing on steps)
 */
export type GenerateTextResult<
  Tools extends ToolSet = ToolSet,
  Output extends AIOutput<unknown, unknown> = AIOutput<unknown, unknown>
> = AIGenerateTextResult<Tools, Output> & {
  /** Unified field name alias for 'text' - provides consistency across all generate* functions */
  result: string;
  /** Sources extracted from search tool results, merged with any native provider sources */
  sources: ExtractedSource[];
};

/**
 * Loads a prompt file and interpolates variables into its content.
 *
 * @param name - Name of the prompt file (without `.prompt` extension).
 * @param variables - Variables to interpolate.
 * @returns The loaded prompt object.
 */
export function loadPrompt(
  name: string,
  variables?: Record<string, string | number | boolean>
): Prompt;

/**
 * Register a custom LLM provider for use in prompt files.
 *
 * @param name - Provider name (used in prompt config `provider` field)
 * @param providerFn - Factory function that creates a model from a model name string
 *
 * @example
 * ```ts
 * import { createDeepSeek } from '@ai-sdk/deepseek';
 * import { registerProvider } from '@outputai/llm';
 *
 * registerProvider('deepseek', createDeepSeek({ apiKey: '...' }));
 * ```
 */
export function registerProvider(
  name: string,
  providerFn: ( modelName: string ) => unknown
): void;

/**
 * Get the list of all registered provider names (built-in and custom).
 *
 * @returns Array of provider name strings
 */
export function getRegisteredProviders(): string[];

/**
 * Use an LLM model to generate text.
 *
 * This function is a wrapper over the AI SDK's `generateText`.
 * The prompt file sets `model`, `messages`, `temperature`, `maxTokens`, and `providerOptions`.
 * Additional AI SDK options (tools, maxRetries, etc.) can be passed through.
 *
 * @param args - Generation arguments.
 * @param args.prompt - Prompt file name.
 * @param args.variables - Variables to interpolate.
 * @param args.tools - Tools the model can call (optional).
 * @param args.toolChoice - Tool selection strategy (optional).
 * @returns AI SDK response with text and metadata.
 */
export function generateText<
  Tools extends ToolSet = ToolSet,
  Output extends AIOutput<unknown, unknown> = AIOutput<unknown, unknown>
>(
  args: {
    prompt: string,
    variables?: Record<string, string | number | boolean>,
    promptDir?: string,
    /**
     * Skill packages to provide to the LLM. Injects `{{ _system_skills }}` and adds the `load_skill` tool.
     * Can be a static array or a function that receives the resolved variables and returns skills.
     */
    skills?: import( './skill.js' ).Skill[] |
      ( ( variables?: Record<string, string | number | boolean> ) => import( './skill.js' ).Skill[] | Promise<import( './skill.js' ).Skill[]> )
  } & GenerateTextAiSdkOptions<Tools, Output>
): Promise<GenerateTextResult<Tools, Output>>;

/**
 * Use an LLM model to stream text generation.
 *
 * This function is a wrapper over the AI SDK's `streamText`.
 * The prompt file sets `model`, `messages`, `temperature`, `maxTokens`, and `providerOptions`.
 * Additional AI SDK options (tools, onChunk, onFinish, onError, etc.) can be passed through.
 *
 * @param args - Generation arguments.
 * @param args.prompt - Prompt file name.
 * @param args.variables - Variables to interpolate.
 * @param args.onChunk - Callback for each stream chunk (optional).
 * @param args.onFinish - Callback when stream finishes (optional).
 * @param args.onError - Callback when stream errors (optional).
 * @returns AI SDK stream result with textStream, fullStream, and metadata promises.
 */
export function streamText<
  Tools extends ToolSet = ToolSet,
  Output extends AIOutput<unknown, unknown> = AIOutput<unknown, unknown>
>(
  args: {
    prompt: string,
    variables?: Record<string, string | number | boolean>
  } & StreamTextAiSdkOptions<Tools, Output>
): AIStreamTextResult<Tools, Output>;

export { skill } from './skill.js';
export type { Skill, SkillsArg } from './skill.js';

/** Pluggable conversation store for multi-turn Agent interactions. */
export interface ConversationStore {
  getMessages(): import( 'ai' ).ModelMessage[] | Promise<import( 'ai' ).ModelMessage[]>;
  addMessages( messages: import( 'ai' ).ModelMessage[] ): void | Promise<void>;
}

/** Create an in-memory conversation store backed by a closure array. */
export function createMemoryConversationStore(): ConversationStore;

/**
 * Agent extends AI SDK's ToolLoopAgent with Output.ai prompt file rendering
 * and the skill system.
 *
 * @example Workflow step — variables per call, stateless
 * ```ts
 * const reviewer = new Agent({
 *   prompt: 'reviewer@v1',
 *   output: Output.object({ schema: z.object({ summary: z.string() }) }),
 *   maxSteps: 5
 * });
 * const result = await reviewer.generate();
 * ```
 *
 * @example Interactive — fixed setup, conversation history
 * ```ts
 * const chatbot = new Agent({
 *   prompt: 'chatbot@v1',
 *   conversationStore: createMemoryConversationStore()
 * });
 * const r1 = await chatbot.generate({ messages: [{ role: 'user', content: 'Hello' }] });
 * ```
 */
export declare class Agent extends import( 'ai' ).ToolLoopAgent {
  constructor( params: {
    /** Prompt file name (e.g. 'my_agent@v1') */
    prompt: string;
    /** Override the stack-resolved prompt directory */
    promptDir?: string;
    /** Variables to render the prompt template at construction time */
    variables?: Record<string, unknown>;
    /** Static skill packages made available to the LLM */
    skills?: import( './skill.js' ).Skill[];
    /** AI SDK tools available during the reasoning loop */
    tools?: ToolSet;
    /** Maximum tool-loop iterations when stopWhen is not specified (default: 10) */
    maxSteps?: number;
    /** Custom stop condition(s) — overrides maxSteps */
    stopWhen?: import( 'ai' ).StopCondition | import( 'ai' ).StopCondition[];
    /** Structured output specification */
    output?: import( 'ai' ).Output<unknown, unknown>;
    /** Pluggable conversation store — opt-in, stateless by default */
    conversationStore?: ConversationStore;
    /** Callback after each step */
    onStepFinish?: import( 'ai' ).GenerateTextOnStepFinishCallback<ToolSet>;
    /** Customize each step before execution */
    prepareStep?: import( 'ai' ).PrepareStepFunction<ToolSet>;
    /** Generation temperature (overrides prompt file value) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Top-k sampling */
    topK?: number;
    /** Random seed for deterministic output */
    seed?: number;
    /** Maximum retry attempts (default: 2) */
    maxRetries?: number;
  } );

  /** Run the agent and return when complete. */
  generate( options?: {
    messages?: import( 'ai' ).ModelMessage[];
    abortSignal?: AbortSignal;
    onStepFinish?: import( 'ai' ).GenerateTextOnStepFinishCallback<ToolSet>;
  } ): Promise<import( 'ai' ).GenerateTextResult<ToolSet, import( 'ai' ).Output<unknown, unknown>>>;

  /** Stream the agent's response. */
  stream( options?: {
    messages?: import( 'ai' ).ModelMessage[];
    abortSignal?: AbortSignal;
    onStepFinish?: import( 'ai' ).StreamTextOnStepFinishCallback<ToolSet>;
    experimental_transform?: import( 'ai' ).StreamTextTransform<ToolSet> | import( 'ai' ).StreamTextTransform<ToolSet>[];
  } ): Promise<import( 'ai' ).StreamTextResult<ToolSet, import( 'ai' ).Output<unknown, unknown>>>;
};
