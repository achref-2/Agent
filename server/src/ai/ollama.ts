import { randomUUID } from "node:crypto";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { AiError, type AiBlock, type AiMessage, type ChatRequest, type ChatResponse, type LLMProvider, type ObjectRequest } from "./provider.js";

// Free local models through Ollama's native REST API (https://github.com/ollama/ollama/blob/main/docs/api.md).
// Uses plain fetch so no extra dependency is needed. Tool calling needs a model that supports it
// (e.g. qwen2.5, qwen3, llama3.1); structured results use Ollama's JSON-schema `format` option and
// are still validated with Zod, because small models do not always follow the schema.

interface OllamaToolCall {
  function: { name: string; arguments: unknown };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done_reason?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly isMock = false;

  constructor(
    private baseUrl: string,
    readonly model: string,
    private numCtx: number,
    private timeoutMs = 300_000,
  ) {}

  private toMessages(system: string, messages: AiMessage[]): OllamaMessage[] {
    const out: OllamaMessage[] = [{ role: "system", content: system }];
    // Ollama identifies tool results by tool name, not id, so remember which id belonged to which tool.
    const toolNames = new Map<string, string>();
    for (const m of messages) {
      if (m.role === "assistant") {
        const text = m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
        const calls = m.content.flatMap((b) => {
          if (b.type !== "tool_use") return [];
          toolNames.set(b.id, b.name);
          return [{ function: { name: b.name, arguments: b.input } }];
        });
        out.push({ role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) });
        continue;
      }
      const texts: string[] = [];
      for (const b of m.content) {
        if (b.type === "tool_result") {
          out.push({ role: "tool", content: b.isError ? `Error: ${b.content}` : b.content, tool_name: toolNames.get(b.toolUseId) });
        } else if (b.type === "text") {
          texts.push(b.text);
        }
      }
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
    }
    return out;
  }

  private async post(body: Record<string, unknown>): Promise<OllamaChatResponse> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: false, options: { num_ctx: this.numCtx }, ...body }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "is not reachable";
      throw new AiError(`The local AI (Ollama at ${this.baseUrl}) ${reason}. Make sure Ollama is running.`, "unavailable");
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 404 && /not found/i.test(detail))
        throw new AiError(`The model "${this.model}" is not installed. Run: ollama pull ${this.model}`, "unavailable");
      if (res.status === 400 && /does not support tools/i.test(detail))
        throw new AiError(`The model "${this.model}" does not support tool calling. Use a model such as qwen2.5 or llama3.1.`, "bad_request");
      throw new AiError(`Ollama returned an error (${res.status}): ${detail}`, res.status >= 500 ? "unavailable" : "bad_request");
    }
    return (await res.json()) as OllamaChatResponse;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const data = await this.post({
      messages: this.toMessages(req.system, req.messages),
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })) }
        : {}),
      ...(req.maxTokens ? { options: { num_ctx: this.numCtx, num_predict: req.maxTokens } } : {}),
    });
    const content: AiBlock[] = [];
    if (data.message.content?.trim()) content.push({ type: "text", text: data.message.content });
    for (const call of data.message.tool_calls ?? []) {
      let input = call.function.arguments;
      if (typeof input === "string") {
        try {
          input = JSON.parse(input);
        } catch {
          // Leave it as a string: the tool's schema validation rejects it and the model is told why.
        }
      }
      content.push({ type: "tool_use", id: `call_${randomUUID()}`, name: call.function.name, input });
    }
    const hasTools = content.some((b) => b.type === "tool_use");
    return {
      content,
      stopReason: hasTools ? "tool_use" : data.done_reason === "length" ? "max_tokens" : "end_turn",
      model: data.model,
    };
  }

  async generateText(req: { system: string; prompt: string; maxTokens?: number }) {
    const res = await this.chat({ system: req.system, messages: [{ role: "user", content: [{ type: "text", text: req.prompt }] }], maxTokens: req.maxTokens });
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  }

  async generateObject<T extends z.ZodType>(req: ObjectRequest<T>): Promise<z.infer<T>> {
    const format = z.toJSONSchema(req.schema);
    const messages: OllamaMessage[] = [
      { role: "system", content: `${req.system}\n\nReply with JSON only, matching the requested schema.` },
      { role: "user", content: req.prompt },
    ];
    // One repair round: small local models sometimes miss a field; tell them what was wrong.
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await this.post({ messages, format, options: { num_ctx: this.numCtx, temperature: 0 } });
      let parsed: unknown;
      let problem: string;
      try {
        parsed = JSON.parse(data.message.content);
        const result = req.schema.safeParse(parsed);
        if (result.success) return result.data;
        problem = result.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
      } catch {
        problem = "the reply was not valid JSON";
      }
      logger.warn("Local AI returned output that does not match the schema", { attempt, problem });
      messages.push({ role: "assistant", content: data.message.content }, { role: "user", content: `That JSON is invalid (${problem}). Reply again with corrected JSON only.` });
    }
    throw new AiError("The local AI model returned a result in the wrong format. Try again, or use a larger model.", "parse");
  }
}
