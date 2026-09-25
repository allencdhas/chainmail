import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmClient,
  LlmContentBlock,
  LlmMessage,
  LlmResponse,
  ToolDefinition,
} from "./types.js";

/**
 * INTEGRATION-ONLY MODULE — not covered by unit tests, for the same reason
 * as `graph/client.ts` and `ens/client.ts`: it wraps a real network call to
 * a third-party API and cannot be meaningfully unit tested without either a
 * live API key or reimplementing the SDK's internals as a fake. All logic
 * that CAN be tested in isolation (the tool-calling loop, prompt building,
 * tool schemas/handlers) lives in sibling files with full unit test
 * coverage; this file only translates between our `LlmClient` interface
 * (see `types.ts`) and the real `@anthropic-ai/sdk` shapes.
 */

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 1024;

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: { apiKey: string; model?: string; maxTokens?: number }) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async createMessage(params: {
    system: string;
    messages: readonly LlmMessage[];
    tools: readonly ToolDefinition[];
  }): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: params.system,
      messages: params.messages.map(toAnthropicMessage),
      tools: params.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
      })),
    });

    return {
      stopReason: response.stop_reason ?? "end_turn",
      content: response.content.map(fromAnthropicContentBlock),
    };
  }
}

function toAnthropicMessage(message: LlmMessage): Anthropic.Messages.MessageParam {
  return {
    role: message.role,
    content: message.content.map(toAnthropicContentBlock),
  };
}

type AnthropicMessageContentBlock =
  | Anthropic.Messages.TextBlockParam
  | Anthropic.Messages.ToolUseBlockParam
  | Anthropic.Messages.ToolResultBlockParam;

function toAnthropicContentBlock(block: LlmContentBlock): AnthropicMessageContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: block.content,
        ...(block.is_error !== undefined ? { is_error: block.is_error } : {}),
      };
  }
}

function fromAnthropicContentBlock(block: Anthropic.Messages.ContentBlock): LlmContentBlock {
  if (block.type === "text") {
    return { type: "text", text: block.text };
  }
  if (block.type === "tool_use") {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  }
  // Anthropic responses only ever contain text/tool_use blocks; anything
  // else (future block types) is surfaced as text so it isn't silently lost.
  return { type: "text", text: JSON.stringify(block) };
}
