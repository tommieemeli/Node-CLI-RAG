import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { ClaudeProvider, type MessagesClient, MockProvider } from "../src/generation";
import type { Prompt } from "../src/types";

const prompt: Prompt = { system: "Rules go here.", user: "Context...\n\nQuestion: Miksi?" };

/** A client that records requests and returns a canned response. Never touches the network. */
function stubClient(response: Partial<Anthropic.Message> = {}) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      async create(params) {
        calls.push(params);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Vastaus." }],
          ...response,
        } as Anthropic.Message;
      },
    },
  };

  return { client, calls };
}

describe("MockProvider", () => {
  it("returns its canned answer", async () => {
    await expect(new MockProvider("Kanned.").complete(prompt)).resolves.toBe("Kanned.");
  });

  it("records the prompt it was given, so tests can assert on assembly", async () => {
    const provider = new MockProvider("Kanned.");
    await provider.complete(prompt);
    expect(provider.received).toEqual([prompt]);
  });
});

describe("ClaudeProvider — request shape", () => {
  it("sends the configured model and a token budget", async () => {
    const { client, calls } = stubClient();
    await new ClaudeProvider(client, "claude-opus-5").complete(prompt);

    expect(calls[0]?.model).toBe("claude-opus-5");
    expect(calls[0]?.max_tokens).toBe(1024);
  });

  it("sends low effort instead of a sampling parameter", async () => {
    const { client, calls } = stubClient();
    await new ClaudeProvider(client, "claude-opus-5").complete(prompt);

    expect(calls[0]?.output_config).toEqual({ effort: "low" });
  });

  it.each(["temperature", "top_p", "top_k"])(
    "does not send %s — current models reject it with a 400",
    async (parameter) => {
      const { client, calls } = stubClient();
      await new ClaudeProvider(client, "claude-opus-5").complete(prompt);

      expect(calls[0]).not.toHaveProperty(parameter);
    },
  );

  it("puts the rules in system and the context and question in the user turn", async () => {
    const { client, calls } = stubClient();
    await new ClaudeProvider(client, "claude-opus-5").complete(prompt);

    expect(calls[0]?.system).toBe(prompt.system);
    expect(calls[0]?.messages).toEqual([{ role: "user", content: prompt.user }]);
  });
});

describe("ClaudeProvider — response handling", () => {
  it("joins multiple text blocks", async () => {
    const { client } = stubClient({
      content: [
        { type: "text", text: "Ahven syö hämärässä. " },
        { type: "text", text: "[source: ahven.md#chunk1]" },
      ] as Anthropic.ContentBlock[],
    });

    await expect(new ClaudeProvider(client, "m").complete(prompt)).resolves.toBe(
      "Ahven syö hämärässä. [source: ahven.md#chunk1]",
    );
  });

  it("ignores non-text blocks such as thinking", async () => {
    const { client } = stubClient({
      content: [
        { type: "thinking", thinking: "hmm", signature: "sig" },
        { type: "text", text: "Vastaus." },
      ] as Anthropic.ContentBlock[],
    });

    await expect(new ClaudeProvider(client, "m").complete(prompt)).resolves.toBe("Vastaus.");
  });

  it("trims surrounding whitespace", async () => {
    const { client } = stubClient({
      content: [{ type: "text", text: "  Vastaus.  " }] as Anthropic.ContentBlock[],
    });

    await expect(new ClaudeProvider(client, "m").complete(prompt)).resolves.toBe("Vastaus.");
  });

  it("reports a refusal rather than returning empty text", async () => {
    const { client } = stubClient({ stop_reason: "refusal", content: [] });

    await expect(new ClaudeProvider(client, "m").complete(prompt)).rejects.toThrow(/declined/i);
  });

  it("reports an empty response with its stop reason", async () => {
    const { client } = stubClient({ stop_reason: "max_tokens", content: [] });

    await expect(new ClaudeProvider(client, "m").complete(prompt)).rejects.toThrow(/max_tokens/);
  });
});

describe("ClaudeProvider — error translation", () => {
  function throwingClient(error: Error): MessagesClient {
    return {
      messages: {
        async create() {
          throw error;
        },
      },
    };
  }

  it("turns a missing credential into the instruction that fixes it", async () => {
    // The SDK resolves credentials lazily, so this surfaces from the request.
    const client = throwingClient(new Error("Could not resolve authentication method."));

    await expect(new ClaudeProvider(client, "m").complete(prompt)).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("passes other failures through untouched rather than blaming credentials", async () => {
    const client = throwingClient(new Error("503 service overloaded"));

    await expect(new ClaudeProvider(client, "m").complete(prompt)).rejects.toThrow(
      /service overloaded/,
    );
  });
});
