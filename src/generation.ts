import Anthropic from "@anthropic-ai/sdk";

import type { LLMProvider, Prompt } from "./types";

/** How much room the answer gets. Answers here are a few sentences plus citations. */
const MAX_TOKENS = 1024;

/**
 * The slice of the Anthropic client this project uses. Narrowing it to an
 * interface is what lets the tests pass a stub and guarantees no test can
 * reach the network.
 */
export interface MessagesClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

/**
 * The SDK resolves credentials lazily, so a missing key surfaces as a request
 * error rather than a constructor error. Both shapes are worth translating into
 * the one instruction that actually fixes it.
 */
function isAuthFailure(error: unknown): boolean {
  if (error instanceof Anthropic.AuthenticationError) return true;
  return error instanceof Error && /authentication|api[- ]?key/i.test(error.message);
}

/** Records what it was asked and returns a canned answer. Used by tests and offline demos. */
export class MockProvider implements LLMProvider {
  readonly received: Prompt[] = [];

  constructor(private readonly answer: string) {}

  async complete(prompt: Prompt): Promise<string> {
    this.received.push(prompt);
    return this.answer;
  }
}

export class ClaudeProvider implements LLMProvider {
  constructor(
    private readonly client: MessagesClient,
    private readonly model: string,
  ) {}

  /**
   * Build a provider against the real API. Credentials are resolved by the SDK
   * (ANTHROPIC_API_KEY, or a profile from `ant auth login`) — and resolved
   * lazily, so a missing credential surfaces from `complete`, not here.
   */
  static fromEnv(model: string): ClaudeProvider {
    return new ClaudeProvider(new Anthropic(), model);
  }

  async complete(prompt: Prompt): Promise<string> {
    let response: Anthropic.Message;
    try {
      // No temperature/top_p/top_k: current models reject them with a 400.
      // Determinism comes from the grounding rules in the system prompt, and
      // low effort keeps a lookup-shaped question from turning into an essay.
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
    } catch (cause) {
      throw isAuthFailure(cause)
        ? new Error(
            "No Anthropic credentials found. Copy .env.example to .env and set ANTHROPIC_API_KEY, then retry.",
            { cause },
          )
        : cause;
    }

    if (response.stop_reason === "refusal") {
      throw new Error("The model declined to answer this question.");
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (text === "") {
      throw new Error(
        `The model returned no text (stop_reason: ${response.stop_reason ?? "unknown"}).`,
      );
    }

    return text;
  }
}
