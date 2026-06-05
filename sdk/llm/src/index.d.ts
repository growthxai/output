import type {
  AgentCallParameters,
  AgentStreamParameters,
  GenerateTextResult as AIGenerateTextResult,
  GenerateImageResult as AIGenerateImageResult,
  StreamTextResult as AIStreamTextResult,
  ToolLoopAgent as AIToolLoopAgent,
  ToolSet,
  StreamTextOnFinishCallback,
  generateText as aiGenerateText,
  streamText as aiStreamText,
  generateImage as aiGenerateImage
} from 'ai';
import type { Output as AIOutputNamespace } from 'ai';

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

// Re-export the tool helper function, Output, smoothStream, stop condition helpers, and jsonSchema
export { tool, Output, smoothStream, stepCountIs, hasToolCall, jsonSchema } from 'ai';

// Web search tool factories
export { tavilySearch, tavilyExtract, tavilyCrawl, tavilyMap } from '@tavily/ai-sdk';
export { webSearch as exaSearch } from '@exalabs/ai-sdk';
export { perplexitySearch } from '@perplexity-ai/ai-sdk';

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

  /** Directory containing the resolved prompt file */
  promptFileDir?: string;

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

    /** Number of images to generate */
    n?: number;

    /** Maximum images to request per provider call */
    maxImagesPerCall?: number;

    /** Image size, for example `1024x1024` */
    size?: `${number}x${number}`;

    /** Image aspect ratio, for example `16:9` */
    aspectRatio?: `${number}:${number}`;

    /** Random seed for deterministic image generation when supported */
    seed?: number;

    /** Skill file or directory paths resolved relative to the prompt file */
    skills?: string | string[];

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

  /** Plain prompt instructions for non-chat prompt files */
  instructions?: string | null;
};

/**
 * An instruction package that an agent can load on demand via the load_skill tool.
 *
 * Skills are declared in prompt frontmatter or passed inline to generation APIs.
 */
export type Skill = {
  name: string;
  description?: string;
  instructions: string;
};

/**
 * The skills argument for async generation APIs. Either a static list or a function
 * that receives the call input and may resolve skills asynchronously.
 */
export type SkillsArg<Input = unknown> = Skill[] |
  ( ( input: Input ) => Skill[] | Promise<Skill[]> );

/** Prompt-owned AI SDK fields supplied by Output prompt files. */
type PromptOwnedTextOptions = 'model' | 'messages' | 'prompt';
type AnyAiOutput = AIOutputNamespace.Output<unknown, unknown, unknown>;

/**
 * AI SDK options accepted by generateText, with prompt-owned fields supplied by Output prompt files.
 *
 * @typeParam Tools - The tools available for the model to call
 */
export type GenerateTextAiSdkOptions<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = Omit<Parameters<typeof aiGenerateText<Tools, OutputSpec>>[0], PromptOwnedTextOptions>;

/**
 * AI SDK options accepted by streamText, with prompt-owned fields supplied by Output prompt files.
 *
 * @typeParam Tools - The tools available for the model to call
 */
export type StreamTextAiSdkOptions<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = Omit<Parameters<typeof aiStreamText<Tools, OutputSpec>>[0], PromptOwnedTextOptions>;

/**
 * AI SDK options specific to generateImage.
 *
 * `model` and `prompt` are omitted because Output supplies them from the prompt file.
 */
export type GenerateImageAiSdkOptions = Omit<Parameters<typeof aiGenerateImage>[0], 'model' | 'prompt'>;
type GenerateImagePrompt = Parameters<typeof aiGenerateImage>[0]['prompt'];
type GenerateImagePromptWithImages = Exclude<GenerateImagePrompt, string>;
type GenerateImageInput = GenerateImagePromptWithImages['images'][number];

/** Agent {@link Agent.stream} options: same as AI SDK plus wrapped `onFinish` (adds `cost`). */
export type OutputAgentStreamParameters = Omit<AgentStreamParameters<never, ToolSet>, 'onFinish'> & {
  onFinish?: WrappedStreamTextOnFinishCallback<ToolSet>;
};

/** Agent constructor options, with prompt-owned model/instructions/tools supplied by Output prompt files and skills. */
export type OutputAgentConstructorParameters<
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = Omit<ConstructorParameters<typeof AIToolLoopAgent>[0], 'model' | 'instructions' | 'tools' | 'output'> & {
  /** Prompt file name (e.g. 'my_agent@v1') */
  prompt: string;
  /** Override the stack-resolved prompt directory */
  promptDir?: string;
  /** Variables to render the prompt template at construction time */
  variables?: Record<string, unknown>;
  /** Structured output specification */
  output?: OutputSpec;
  /** Static skill packages made available to the LLM */
  skills?: Skill[];
  /** AI SDK tools available during the reasoning loop */
  tools?: ConstructorParameters<typeof AIToolLoopAgent>[0]['tools'];
  /** Maximum tool-loop iterations when stopWhen is not specified (default: 10) */
  maxSteps?: number;
  /** Pluggable conversation store — opt-in, stateless by default */
  conversationStore?: ConversationStore;
};

/** Agent generate options accepted by the underlying AI SDK agent. */
export type OutputAgentGenerateParameters = AgentCallParameters<never, ToolSet>;

/** Parameters accepted by {@link generateText}. */
export type GenerateTextParameters<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = {
  /** Prompt file name */
  prompt: string;
  /** Variables to interpolate into the prompt file */
  variables?: Record<string, string | number | boolean>;
  /** Override the stack-resolved prompt directory */
  promptDir?: string;
  /** Skill packages to provide to the LLM through the `load_skill` tool */
  skills?: SkillsArg<Record<string, string | number | boolean> | undefined>;
  /** Used to create a default `stepCountIs(maxSteps)` when tools are present and `stopWhen` is omitted */
  maxSteps?: number;
} & GenerateTextAiSdkOptions<Tools, OutputSpec>;

/** Parameters accepted by {@link streamText}. */
export type StreamTextParameters<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = {
  /** Prompt file name */
  prompt: string;
  /** Variables to interpolate into the prompt file */
  variables?: Record<string, string | number | boolean>;
  /** Override the stack-resolved prompt directory */
  promptDir?: string;
  /** Skill packages to provide to the LLM through the `load_skill` tool. Function resolvers must be synchronous. */
  skills?: Skill[] | ( ( input: Record<string, string | number | boolean> | undefined ) => Skill[] );
  /** Used to create a default `stepCountIs(maxSteps)` when tools are present and `stopWhen` is omitted */
  maxSteps?: number;
  /** Callback when stream finishes. Receives the wrapped event with optional `cost`. */
  onFinish?: WrappedStreamTextOnFinishCallback<Tools>;
} & Omit<StreamTextAiSdkOptions<Tools, OutputSpec>, 'onFinish'>;

/** Parameters accepted by {@link generateImage}. */
export type GenerateImageParameters = {
  /** Prompt file name */
  prompt: string;
  /** Variables to interpolate into the prompt file */
  variables?: Record<string, string | number | boolean>;
  /** Override the stack-resolved prompt directory */
  promptDir?: string;
  /** Runtime image inputs for image-to-image generation */
  images?: GenerateImageInput[];
  /** Optional mask for image editing */
  mask?: GenerateImagePromptWithImages['mask'];
} & GenerateImageAiSdkOptions;

/** A source extracted from search tool results during multi-step LLM execution. */
export type ExtractedSource = {
  type: 'source';
  sourceType: 'url';
  id: string;
  url: string;
  title: string;
};

/**
 * Cost breakdown from the cost module (`calculateLLMCallCost`). `total` is null when pricing data is missing or calculation fails.
 */
export type LLMCallCost = {
  total: number | null;
  components?: Array<{
    name: string,
    value: number
  }>;
  message?: string;
};

export type LLMUsageEvent = {
  type: 'llm:usage';
  modelId: string;
  usage: Array<{
    type: string;
    ppm: number;
    amount: number;
    total: number;
  }>;
  total: number;
  tokensUsed: number;
};

/**
 * `streamText` and agent `stream` `onFinish` event after the stream response wrapper: same as the AI SDK
 * finish payload plus optional `cost` from pricing.
 */
export type WrappedStreamTextOnFinishEvent<Tools extends ToolSet = ToolSet> =
  Parameters<StreamTextOnFinishCallback<Tools>>[0] & { cost?: LLMCallCost };

export type WrappedStreamTextOnFinishCallback<Tools extends ToolSet = ToolSet> = (
  event: WrappedStreamTextOnFinishEvent<Tools>
) => void | PromiseLike<void>;

/**
 * Result from generateText including full AI SDK response metadata.
 * Extends AI SDK's GenerateTextResult with a unified `result` field.
 * @typeParam Tools - The tools available for the model to call (preserves typing on steps)
 */
export type GenerateTextResult<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = AIGenerateTextResult<Tools, OutputSpec> & {
  /** Unified field name alias for 'text' */
  result: string;
  /** Calculated cost in USD for the LLM call (present after wrapping; `total` may be null if pricing is unavailable) */
  cost?: LLMCallCost;
  /** Sources extracted from search tool results, merged with any native provider sources */
  sources: ExtractedSource[];
};

/** Result from generateImage including a unified `result` field pointing at the first image. */
export type GenerateImageResult = AIGenerateImageResult & {
  /** Unified field name alias for `image` */
  result: AIGenerateImageResult['image'];
  /** Calculated cost for the image generation call when pricing data is available. */
  cost?: LLMCallCost;
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
  variables?: Record<string, string | number | boolean>,
  promptDir?: string
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
 * All other AI SDK `generateText` options are accepted via {@link GenerateTextAiSdkOptions}, including
 * tools, tool choice, structured output, callbacks, retries, and sampling settings.
 *
 * @param args - Generation arguments. See {@link GenerateTextParameters}.
 * @returns AI SDK response with text and metadata.
 */
export function generateText<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
>(
  args: GenerateTextParameters<Tools, OutputSpec>
): Promise<GenerateTextResult<Tools, OutputSpec>>;

/**
 * Use an LLM model to stream text generation.
 *
 * This function is a wrapper over the AI SDK's `streamText`.
 * The prompt file sets `model`, `messages`, `temperature`, `maxTokens`, and `providerOptions`.
 * All other AI SDK `streamText` options are accepted via {@link StreamTextAiSdkOptions}, except
 * `onFinish`, which Output wraps to add optional cost data.
 *
 * @param args - Streaming arguments. See {@link StreamTextParameters}.
 * @returns AI SDK stream result with textStream, fullStream, and metadata promises.
 */
export function streamText<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
>(
  args: StreamTextParameters<Tools, OutputSpec>
): AIStreamTextResult<Tools, OutputSpec>;

/**
 * Use an image model to generate images from a prompt file.
 *
 * The prompt file supplies AI SDK `model` and `prompt`. All other AI SDK `generateImage`
 * options are accepted via {@link GenerateImageAiSdkOptions}, including `n`, `size`,
 * `aspectRatio`, `seed`, provider options, retries, abort signal, and headers.
 *
 * @param args - Image generation arguments. See {@link GenerateImageParameters}.
 * @returns AI SDK image response with `result` aliasing the first image.
 */
export function generateImage(
  args: GenerateImageParameters
): Promise<GenerateImageResult>;

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
export function skill( params: {
  name: string;
  description?: string;
  instructions: string;
} ): Skill;

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
export declare class Agent<
  OutputSpec extends AnyAiOutput = AnyAiOutput
> extends AIToolLoopAgent<never, ToolSet, OutputSpec> {
  constructor( params: OutputAgentConstructorParameters<OutputSpec> );

  /**
   * Run the agent and return when complete.
   * Same augmented shape as {@link generateText}: `result`, optional `cost`, merged `sources`.
   */
  generate( options?: OutputAgentGenerateParameters ): Promise<GenerateTextResult<ToolSet, OutputSpec>>;

  /**
   * Stream the agent's response.
   * `onFinish` receives {@link WrappedStreamTextOnFinishEvent} (`cost` optional), matching {@link streamText}.
   */
  stream( options?: OutputAgentStreamParameters ): Promise<
    AIStreamTextResult<ToolSet, OutputSpec>
  >;
}
