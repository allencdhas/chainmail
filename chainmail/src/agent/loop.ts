import type {
  LlmClient,
  LlmContentBlock,
  LlmMessage,
  TextBlock,
  ToolDefinition,
  ToolResultBlock,
  ToolUseBlock,
} from "./types.js";
import type { ToolHandler, ToolHandlerContext } from "./tools.js";

/**
 * Multi-turn tool-calling agent loop, per the PRD's Agent Loop architecture:
 * parse intent -> check_duplicate -> observe -> check_policy_limits ->
 * create_invoice -> return. Each call to `runAgentLoop` handles exactly one
 * email and terminates — it is not a standing background process.
 *
 * The loop itself has no idea it's talking to Anthropic (or any specific
 * vendor): `client` is the `LlmClient` interface from `types.ts`, so this
 * file is fully testable against a scripted fake without any network or SDK
 * dependency. `anthropicClient.ts` supplies the real implementation.
 */

const DEFAULT_MAX_TURNS = 6;

export class AgentLoopMaxTurnsExceededError extends Error {
  constructor(
    public readonly maxTurns: number,
    public readonly toolCallLog: readonly ToolCallLogEntry[],
  ) {
    super(`Agent loop did not reach a final response within ${maxTurns} turns.`);
    this.name = "AgentLoopMaxTurnsExceededError";
  }
}

export interface ToolCallLogEntry {
  readonly name: string;
  readonly input: unknown;
  readonly output: string;
  readonly isError: boolean;
}

export interface AgentLoopResult {
  readonly finalText: string;
  readonly toolCallLog: readonly ToolCallLogEntry[];
  readonly turnsUsed: number;
}

export interface RunAgentLoopParams {
  readonly client: LlmClient;
  readonly systemPrompt: string;
  readonly initialUserMessage: string;
  readonly tools: readonly ToolDefinition[];
  readonly toolHandlers: Readonly<Record<string, ToolHandler>>;
  readonly toolContext: ToolHandlerContext;
  readonly maxTurns?: number;
}

function isToolUseBlock(block: LlmContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function isTextBlock(block: LlmContentBlock): block is TextBlock {
  return block.type === "text";
}

function extractText(content: readonly LlmContentBlock[]): string {
  return content.filter(isTextBlock).map((block) => block.text).join("\n");
}

export async function runAgentLoop(params: RunAgentLoopParams): Promise<AgentLoopResult> {
  const maxTurns = params.maxTurns ?? DEFAULT_MAX_TURNS;
  const toolCallLog: ToolCallLogEntry[] = [];

  const messages: LlmMessage[] = [
    { role: "user", content: [{ type: "text", text: params.initialUserMessage }] },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await params.client.createMessage({
      system: params.systemPrompt,
      messages,
      tools: params.tools,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(isToolUseBlock);

    if (toolUseBlocks.length === 0) {
      return {
        finalText: extractText(response.content),
        toolCallLog,
        turnsUsed: turn + 1,
      };
    }

    const toolResultBlocks: ToolResultBlock[] = toolUseBlocks.map((block) => {
      const handler = params.toolHandlers[block.name];

      if (!handler) {
        const message = `Unknown tool: "${block.name}"`;
        toolCallLog.push({ name: block.name, input: block.input, output: message, isError: true });
        return { type: "tool_result", tool_use_id: block.id, content: message, is_error: true };
      }

      const result = handler(block.input, params.toolContext);
      toolCallLog.push({
        name: block.name,
        input: block.input,
        output: result.content,
        isError: result.isError,
      });
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError,
      };
    });

    messages.push({ role: "user", content: toolResultBlocks });
  }

  throw new AgentLoopMaxTurnsExceededError(maxTurns, toolCallLog);
}
