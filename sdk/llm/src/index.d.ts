import type {
  GenerateTextResult as AIGenerateTextResult,
  GenerateImageResult as AIGenerateImageResult,
  StreamTextResult as AIStreamTextResult,
  ToolLoopAgent as AIToolLoopAgent,
  ToolSet,
  ToolChoice,
  StopCondition,
  ModelMessage,
  StreamTextOnChunkCallback,
  StreamTextOnFinishCallback,
  StreamTextOnErrorCallback
} from 'ai';
import type { Output as AIOutputNamespace } from 'ai';

/** Full AI SDK module (values and types). Use `aiSdk.Output`, `aiSdk.tool`, `aiSdk.stepCountIs`, `aiSdk.ToolSet`, and other AI SDK APIs. */
export * as aiSdk from 'ai';

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
  /**
   * Parsed opening-tag attributes for the block. Currently `options` - a space-separated list of
   * frontmatter `messageOptions` set names - which is resolved into per-message `providerOptions`
   * at call time and stripped before the request is sent. Authored as `<system options="set_a set_b">`.
   */
  attributes?: Record<string, string | true>;
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
  fileDir: string;

  /** General configuration for the LLM */
  config: {
    /**
     * LLM provider.
     *
     * Built-in: `'anthropic'`, `'openai'`, `'azure'`, `'amazon-bedrock'`, `'google-vertex'`,
     * `'perplexity'`. Legacy aliases `'bedrock'` and `'vertex'` are deprecated but still accepted.
     * Custom providers registered via {@link registerProvider} are also accepted.
     */
    provider: string;

    /** Model name/identifier */
    model: string;

    /** Generation temperature (0-2). Lower = more deterministic */
    temperature?: number;

    /** Maximum number of tokens in the response */
    maxTokens?: number;

    /** Tool-loop iterations when `stopWhen` is omitted. Defaults to 10 after load. */
    maxSteps?: number;

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

    /** Skill file or directory paths relative to the prompt file */
    skills?: string[];

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

    /**
     * Named, reusable per-message `providerOptions` sets, referenced from message blocks via the
     * `options="<name>"` attribute. Each value is a provider-namespaced options object, e.g.
     * `{ anthropic: { cacheControl: { type: 'ephemeral' } } }`.
     */
    messageOptions?: Record<string, Record<string, Record<string, unknown>>>;
  };

  /** Array of messages in the conversation */
  messages: PromptMessage[];

  /** Plain prompt instructions for non-chat prompt files */
  instructions?: string | null;
};

/**
 * An instruction package that the model can load on demand via `load_skill`.
 *
 * Skills are declared as paths in prompt frontmatter and loaded from markdown files.
 */
export type Skill = {
  name: string;
  description: string;
  instructions: string;
};

type AnyAiOutput = AIOutputNamespace.Output<unknown, unknown, unknown>;
type CompatibleToolFunction = ( ...args: never[] ) => unknown | PromiseLike<unknown>;
type CompatibleApprovalFunction = ( ...args: never[] ) => boolean | PromiseLike<boolean>;

/**
 * Structurally-compatible AI SDK tool shape.
 *
 * This intentionally avoids referencing AI SDK's concrete `Tool` schema types so tools
 * from packages resolved with a different Zod peer instance remain assignable.
 */
export type CompatibleTool = {
  description?: string;
  title?: string;
  providerOptions?: Record<string, unknown>;
  inputSchema?: unknown;
  parameters?: unknown;
  execute?: CompatibleToolFunction;
  onInputStart?: CompatibleToolFunction;
  onInputDelta?: CompatibleToolFunction;
  onInputAvailable?: CompatibleToolFunction;
  needsApproval?: boolean | CompatibleApprovalFunction;
} & (
  { inputSchema: unknown } |
  { parameters: unknown } |
  { execute: CompatibleToolFunction }
);

/** AI SDK tools accepted by Output APIs without requiring one exact Zod peer instance. */
export type CompatibleToolSet = Record<string, CompatibleTool>;

type PromptFileCallOptions = {
  /** Prompt file name (e.g. 'summary@v1') */
  prompt: string;
  /** Variables to interpolate into the prompt file */
  variables?: Record<string, string | number | boolean>;
  /** Override the stack-resolved prompt directory */
  promptDir?: string;
};

type StopWhen<Tools extends ToolSet = ToolSet> =
  StopCondition<NoInfer<Tools>> | Array<StopCondition<NoInfer<Tools>>>;

type TextCallOptions<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = PromptFileCallOptions & {
  /** AI SDK tools, accepted structurally to tolerate different Zod peer versions. */
  tools?: CompatibleToolSet;
  /** Structured output specification */
  output?: OutputSpec;
  /** Tool choice, applied only when tools exist */
  toolChoice?: ToolChoice<Tools>;
  /** Caller stop condition; otherwise prompt `maxSteps` when tools exist */
  stopWhen?: StopWhen<Tools>;
  /** Abort signal for the request */
  abortSignal?: AbortSignal;
};

/** Parameters accepted by {@link generateText}. */
export type GenerateTextParameters<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = TextCallOptions<Tools, OutputSpec>;

/** Parameters accepted by {@link generateTextWithStreaming}. */
export type GenerateTextWithStreamingParameters<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = TextCallOptions<Tools, OutputSpec> & {
  /** Callback for each streamed chunk */
  onChunk?: StreamTextOnChunkCallback<Tools>;
};

/** Parameters accepted by {@link streamText}. */
export type StreamTextParameters<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = TextCallOptions<Tools, OutputSpec> & {
  /** Callback for each streamed chunk */
  onChunk?: StreamTextOnChunkCallback<Tools>;
  /** Callback when a stream error occurs */
  onError?: StreamTextOnErrorCallback;
  /** Callback when stream finishes. Receives the wrapped event with optional `cost`. */
  onFinish?: WrappedStreamTextOnFinishCallback<Tools>;
};

/** Runtime image bytes or an object with optional media type. */
export type GenerateImageInput =
  | Buffer |
  Uint8Array |
  ArrayBuffer |
  string |
  {
    data: Buffer | Uint8Array | ArrayBuffer | string;
    mediaType?: string;
  };

/** Parameters accepted by {@link generateImage}. */
export type GenerateImageParameters = PromptFileCallOptions & {
  /** Runtime image inputs for image-to-image generation */
  images?: GenerateImageInput[];
  /** Optional mask for image editing; requires `images` */
  mask?: GenerateImageInput;
  /** Abort signal for the request */
  abortSignal?: AbortSignal;
};

/** Agent constructor options. */
export type OutputAgentConstructorParameters<
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = PromptFileCallOptions & {
  /** Structured output specification */
  output?: OutputSpec;
  /** AI SDK tools available during the reasoning loop */
  tools?: CompatibleToolSet;
  /** Caller stop condition; otherwise prompt `maxSteps` when tools exist */
  stopWhen?: StopWhen;
  /** Pluggable conversation store. Opt-in; stateless by default. */
  conversationStore?: ConversationStore;
};

/** Agent {@link Agent.generate} options. */
export type OutputAgentGenerateParameters = {
  messages?: ModelMessage[];
  abortSignal?: AbortSignal;
  toolChoice?: ToolChoice<ToolSet>;
};

/** Agent {@link Agent.generateWithStreaming} options. Completion is the returned promise; use `onChunk` for progress. */
export type OutputAgentGenerateWithStreamingParameters = OutputAgentGenerateParameters & {
  onChunk?: StreamTextOnChunkCallback<ToolSet>;
};

/** Agent {@link Agent.stream} options. `onFinish` receives the wrapped event with optional `cost`. */
export type OutputAgentStreamParameters = OutputAgentGenerateWithStreamingParameters & {
  onFinish?: WrappedStreamTextOnFinishCallback<ToolSet>;
  onError?: StreamTextOnErrorCallback;
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

/** Completed result from {@link generateTextWithStreaming}. */
export type GenerateTextWithStreamingResult<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
> = Omit<GenerateTextResult<Tools, OutputSpec>, 'experimental_output'>;

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
export function getProviderNames(): string[];

/**
 * Use an LLM model to generate text.
 *
 * This function is a wrapper over the AI SDK's `generateText`.
 * The prompt file sets `model`, `messages`, `temperature`, `maxTokens`, `maxSteps`, `skills`, and
 * `providerOptions`. Call arguments are `prompt`, `promptDir`, `variables`, `tools`, `output`,
 * `toolChoice`, `stopWhen`, and `abortSignal`.
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
 * Generate text over streaming transport and return a completed response.
 *
 * The stream is consumed internally. `onChunk` runs as parts arrive. Provider or
 * transport errors reject the returned promise with the mapped error. Use {@link streamText}
 * when you need `onFinish` / `onError` stream observers.
 *
 * @param args - Streaming arguments. See {@link GenerateTextWithStreamingParameters}.
 * @returns Completed response with parsed output and generateText-compatible metadata.
 */
export function generateTextWithStreaming<
  Tools extends ToolSet = ToolSet,
  OutputSpec extends AnyAiOutput = AnyAiOutput
>(
  args: GenerateTextWithStreamingParameters<Tools, OutputSpec>
): Promise<GenerateTextWithStreamingResult<Tools, OutputSpec>>;

/**
 * Use an LLM model to stream text generation.
 *
 * This function is a wrapper over the AI SDK's `streamText`.
 * The prompt file sets `model`, `messages`, `temperature`, `maxTokens`, `maxSteps`, `skills`, and
 * `providerOptions`. Call arguments match {@link generateText}, plus `onChunk`, `onFinish`, and
 * `onError`. `onFinish` is wrapped to add optional cost data.
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
 * The prompt file supplies `model`, instructions, `n`, `size`, `aspectRatio`, `seed`,
 * `maxImagesPerCall`, and `providerOptions`. Call arguments are `prompt`, `promptDir`, `variables`,
 * `images`, `mask`, and `abortSignal`.
 *
 * @param args - Image generation arguments. See {@link GenerateImageParameters}.
 * @returns AI SDK image response with `result` aliasing the first image.
 */
export function generateImage(
  args: GenerateImageParameters
): Promise<GenerateImageResult>;

/** Pluggable conversation store for multi-turn Agent interactions. */
export interface ConversationStore {
  getMessages(): ModelMessage[] | Promise<ModelMessage[]>;
  addMessages( messages: ModelMessage[] ): void | Promise<void>;
}

/** Create an in-memory conversation store backed by a closure array. */
export function createMemoryConversationStore(): ConversationStore;

/**
 * Agent extends AI SDK's ToolLoopAgent with Output.ai prompt file rendering.
 *
 * @example Workflow step - variables per call, stateless
 * ```ts
 * const reviewer = new Agent({
 *   prompt: 'reviewer@v1',
 *   output: aiSdk.Output.object({ schema: z.object({ summary: z.string() }) })
 * });
 * const result = await reviewer.generate();
 * ```
 *
 * @example Interactive - fixed setup, conversation history
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
   * Run the agent over streaming transport and return a completed response.
   * `onChunk` runs as parts arrive. Provider and transport errors reject with the mapped error.
   * Use {@link Agent.stream} when you need `onFinish` / `onError` stream observers.
   */
  generateWithStreaming(
    options?: OutputAgentGenerateWithStreamingParameters
  ): Promise<GenerateTextWithStreamingResult<ToolSet, OutputSpec>>;

  /**
   * Stream the agent's response.
   * `onFinish` receives {@link WrappedStreamTextOnFinishEvent} (`cost` optional), matching {@link streamText}.
   */
  stream( options?: OutputAgentStreamParameters ): Promise<
    AIStreamTextResult<ToolSet, OutputSpec>
  >;
}
