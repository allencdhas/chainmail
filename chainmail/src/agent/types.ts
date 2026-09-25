/**
 * LLM client abstraction, shaped directly after Anthropic's Messages API
 * (system prompt + message list of content blocks, tool_use / tool_result
 * blocks, a stop reason). Modeling it this way means `loop.ts` can be fully
 * unit tested against a scripted fake client, and the real
 * `@anthropic-ai/sdk` wiring in `anthropicClient.ts` is a thin pass-through
 * rather than something the loop's logic depends on directly.
 */

export interface TextBlock {
  readonly type: "text";
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface ToolResultBlock {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content: string;
  readonly is_error?: boolean;
}

export type LlmContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type LlmRole = "user" | "assistant";

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: readonly LlmContentBlock[];
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema describing the tool's input, as required by the Anthropic tool-use API. */
  readonly inputSchema: Record<string, unknown>;
}

export type StopReason = "tool_use" | "end_turn" | "max_tokens" | string;

export interface LlmResponse {
  readonly stopReason: StopReason;
  readonly content: readonly LlmContentBlock[];
}

export interface LlmClient {
  createMessage(params: {
    readonly system: string;
    readonly messages: readonly LlmMessage[];
    readonly tools: readonly ToolDefinition[];
  }): Promise<LlmResponse>;
}
