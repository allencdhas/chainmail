import { describe, expect, it } from "vitest";
import { AgentLoopMaxTurnsExceededError, runAgentLoop } from "../../src/agent/loop.js";
import { AGENT_TOOLS, buildToolHandlers } from "../../src/agent/tools.js";
import type { LlmClient, LlmMessage, LlmResponse, ToolDefinition } from "../../src/agent/types.js";
import type { PolicyConfig, TransactionRecord } from "../../src/policy/types.js";

const POLICY_CONFIG: PolicyConfig = {
  perTransactionCapUsd: 1000,
  dailyCapUsd: 2000,
  secondConfirmationThresholdUsd: 500,
  blockedRecipients: [],
};

const TOOL_CONTEXT = {
  payeeEmail: "alex@example.com",
  history: [] as TransactionRecord[],
  policyConfig: POLICY_CONFIG,
  now: new Date("2026-09-25T12:00:00.000Z"),
};

/** Scripted fake LLM client: returns each queued response in order, one per call. */
class ScriptedLlmClient implements LlmClient {
  private callCount = 0;
  public readonly receivedMessages: LlmMessage[][] = [];
  public readonly receivedTools: readonly ToolDefinition[][] = [];
  public readonly receivedSystemPrompts: string[] = [];

  constructor(private readonly responses: readonly LlmResponse[]) {}

  async createMessage(params: {
    system: string;
    messages: readonly LlmMessage[];
    tools: readonly ToolDefinition[];
  }): Promise<LlmResponse> {
    this.receivedMessages.push([...params.messages]);
    (this.receivedTools as ToolDefinition[][]).push([...params.tools]);
    this.receivedSystemPrompts.push(params.system);

    const response = this.responses[this.callCount];
    this.callCount += 1;
    if (!response) {
      throw new Error(`ScriptedLlmClient exhausted after ${this.callCount - 1} calls.`);
    }
    return response;
  }

  get calls(): number {
    return this.callCount;
  }
}

describe("runAgentLoop", () => {
  it("returns immediately when the first response has no tool calls", async () => {
    const client = new ScriptedLlmClient([
      { stopReason: "end_turn", content: [{ type: "text", text: "No action needed." }] },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "hello",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(result.finalText).toBe("No action needed.");
    expect(result.toolCallLog).toHaveLength(0);
    expect(result.turnsUsed).toBe(1);
    expect(client.calls).toBe(1);
  });

  it("executes a tool call and feeds the result back for a second turn", async () => {
    const client = new ScriptedLlmClient([
      {
        stopReason: "tool_use",
        content: [
          { type: "text", text: "Let me check for duplicates." },
          { type: "tool_use", id: "call-1", name: "check_duplicate", input: { recipient: "client@example.com", amountUsd: 500 } },
        ],
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "No duplicate found. Proposing invoice." }],
      },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "bill client@example.com $500",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(client.calls).toBe(2);
    expect(result.finalText).toBe("No duplicate found. Proposing invoice.");
    expect(result.toolCallLog).toHaveLength(1);
    expect(result.toolCallLog[0]?.name).toBe("check_duplicate");
    expect(result.toolCallLog[0]?.isError).toBe(false);
    expect(JSON.parse(result.toolCallLog[0]!.output)).toHaveProperty("isDuplicate", false);

    // Second call must have received the tool_result from the first turn.
    const secondCallMessages = client.receivedMessages[1]!;
    const lastMessage = secondCallMessages[secondCallMessages.length - 1]!;
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content[0]?.type).toBe("tool_result");
  });

  it("runs the full check_duplicate -> check_policy_limits -> create_invoice sequence across turns", async () => {
    const client = new ScriptedLlmClient([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "call-1", name: "check_duplicate", input: { recipient: "client@example.com", amountUsd: 500 } }],
      },
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "call-2", name: "check_policy_limits", input: { recipient: "client@example.com", amountUsd: 500 } }],
      },
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "call-3", name: "create_invoice", input: { recipient: "client@example.com", amountUsd: 500, memo: "logo work" } }],
      },
      {
        stopReason: "end_turn",
        content: [{ type: "text", text: "Invoice proposed for $500. This amount requires your second confirmation." }],
      },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "bill client@example.com $500 for the logo work",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(client.calls).toBe(4);
    expect(result.toolCallLog.map((c) => c.name)).toEqual([
      "check_duplicate",
      "check_policy_limits",
      "create_invoice",
    ]);
    expect(result.toolCallLog.every((c) => !c.isError)).toBe(true);
    expect(result.finalText).toContain("second confirmation");
  });

  it("handles multiple tool_use blocks within a single turn", async () => {
    const client = new ScriptedLlmClient([
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", id: "call-1", name: "check_duplicate", input: { recipient: "client@example.com", amountUsd: 100 } },
          { type: "tool_use", id: "call-2", name: "check_policy_limits", input: { recipient: "client@example.com", amountUsd: 100 } },
        ],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "msg",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(result.toolCallLog).toHaveLength(2);
    expect(client.calls).toBe(2);
  });

  it("surfaces a tool-handler error as an is_error tool_result and lets the loop continue", async () => {
    const client = new ScriptedLlmClient([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "call-1", name: "create_invoice", input: { recipient: "client@example.com" /* missing amountUsd, memo */ } }],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "Could not create the invoice, missing details." }] },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "msg",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(result.toolCallLog[0]?.isError).toBe(true);
    expect(result.finalText).toContain("missing details");
  });

  it("reports an unknown tool name as an error without crashing the loop", async () => {
    const client = new ScriptedLlmClient([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_use", id: "call-1", name: "delete_everything", input: {} }],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "done" }] },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "msg",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(result.toolCallLog[0]?.name).toBe("delete_everything");
    expect(result.toolCallLog[0]?.isError).toBe(true);
    expect(result.toolCallLog[0]?.output).toMatch(/Unknown tool/);
  });

  it("throws AgentLoopMaxTurnsExceededError if the loop never reaches a final response", async () => {
    const foreverToolUse: LlmResponse = {
      stopReason: "tool_use",
      content: [{ type: "tool_use", id: "call-x", name: "check_duplicate", input: { recipient: "client@example.com", amountUsd: 1 } }],
    };
    const client = new ScriptedLlmClient(Array.from({ length: 10 }, () => foreverToolUse));

    await expect(
      runAgentLoop({
        client,
        systemPrompt: "system",
        initialUserMessage: "msg",
        tools: AGENT_TOOLS,
        toolHandlers: buildToolHandlers(),
        toolContext: TOOL_CONTEXT,
        maxTurns: 3,
      }),
    ).rejects.toThrow(AgentLoopMaxTurnsExceededError);

    expect(client.calls).toBe(3);
  });

  it("respects a custom maxTurns", async () => {
    const client = new ScriptedLlmClient([
      { stopReason: "end_turn", content: [{ type: "text", text: "immediate" }] },
    ]);

    const result = await runAgentLoop({
      client,
      systemPrompt: "system",
      initialUserMessage: "msg",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
      maxTurns: 1,
    });

    expect(result.turnsUsed).toBe(1);
  });

  it("passes the provided tools and system prompt through to the client on every call", async () => {
    const client = new ScriptedLlmClient([
      { stopReason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ]);

    await runAgentLoop({
      client,
      systemPrompt: "SYSTEM_PROMPT_MARKER",
      initialUserMessage: "msg",
      tools: AGENT_TOOLS,
      toolHandlers: buildToolHandlers(),
      toolContext: TOOL_CONTEXT,
    });

    expect(client.receivedTools[0]).toEqual(AGENT_TOOLS);
    expect(client.receivedSystemPrompts[0]).toBe("SYSTEM_PROMPT_MARKER");
  });
});
