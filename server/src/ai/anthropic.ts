import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { logger } from "../lib/logger.js";
import { AiError, type AiBlock, type AiMessage, type ChatRequest, type ChatResponse, type LLMProvider, type ObjectRequest } from "./provider.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly isMock = false;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private effort: Effort,
    private fallbacks: "default" | "off",
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  // Server-side refusal fallback: if the model declines for policy reasons, the API retries on a
  // server-chosen fallback model inside the same call. Disable with ANTHROPIC_FALLBACKS=off.
  private common() {
    return {
      model: this.model,
      output_config: { effort: this.effort },
      cache_control: { type: "ephemeral" as const },
      ...(this.fallbacks === "default" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    };
  }

  private toParams(messages: AiMessage[]): Anthropic.Beta.BetaMessageParam[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content.map((b): Anthropic.Beta.BetaContentBlockParam => {
        switch (b.type) {
          case "text":
            return { type: "text", text: b.text };
          case "tool_use":
            return { type: "tool_use", id: b.id, name: b.name, input: b.input };
          case "tool_result":
            return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, is_error: b.isError ?? false };
          case "opaque":
            return b.raw as Anthropic.Beta.BetaContentBlockParam;
        }
      }),
    }));
  }

  private fromContent(content: Anthropic.Beta.BetaContentBlock[]): AiBlock[] {
    return content.map((b): AiBlock => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      return { type: "opaque", raw: b };
    });
  }

  private wrap(err: unknown): never {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
      throw new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", "auth");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("The AI provider is rate limiting requests. Try again in a minute.", "rate_limit");
    if (err instanceof Anthropic.BadRequestError) throw new AiError(`The AI provider rejected the request: ${err.message}`, "bad_request");
    if (err instanceof Anthropic.APIError) throw new AiError(`AI provider error (${err.status ?? "network"}). Try again later.`, "unavailable");
    throw err;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    try {
      const stream = this.client.beta.messages.stream({
        ...this.common(),
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: this.toParams(req.messages),
        tools: req.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema })),
      });
      const res = await stream.finalMessage();
      const stop = res.stop_reason;
      if (stop === "refusal") logger.warn("AI refusal", { category: res.stop_details?.category ?? null });
      return {
        content: this.fromContent(res.content),
        stopReason: stop === "end_turn" || stop === "tool_use" || stop === "max_tokens" || stop === "refusal" ? stop : "other",
        model: res.model,
      };
    } catch (err) {
      this.wrap(err);
    }
  }

  async generateText(req: { system: string; prompt: string; maxTokens?: number }) {
    const res = await this.chat({ system: req.system, messages: [{ role: "user", content: [{ type: "text", text: req.prompt }] }], maxTokens: req.maxTokens });
    if (res.stopReason === "refusal") throw new AiError("The AI declined this request.", "refusal");
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  }

  async generateObject<T extends z.ZodType>(req: ObjectRequest<T>): Promise<z.infer<T>> {
    try {
      const res = await this.client.beta.messages.parse({
        ...this.common(),
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
        output_config: { effort: this.effort, format: betaZodOutputFormat(req.schema) },
      });
      if (res.stop_reason === "refusal") throw new AiError("The AI declined this request.", "refusal");
      if (res.stop_reason === "max_tokens") throw new AiError("The AI response was cut off. Try a smaller request.", "parse");
      if (res.parsed_output == null) throw new AiError("The AI returned an unreadable response.", "parse");
      return res.parsed_output as z.infer<T>;
    } catch (err) {
      this.wrap(err);
    }
  }
}
