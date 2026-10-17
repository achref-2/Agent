import type { z } from "zod";

// Provider-neutral message format so another model provider can be added later without touching
// the agent loop or the tools. `opaque` carries provider-specific blocks (e.g. thinking blocks)
// that must be passed back unchanged within one agent turn.
export type AiBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "opaque"; raw: unknown };

export interface AiMessage {
  role: "user" | "assistant";
  content: AiBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface ChatRequest {
  system: string;
  messages: AiMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
}

export interface ChatResponse {
  content: AiBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";
  model: string;
}

export interface ObjectRequest<T extends z.ZodType> {
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** True only for the development mock. The UI labels its output as not real AI. */
  readonly isMock: boolean;
  chat(req: ChatRequest): Promise<ChatResponse>;
  generateText(req: { system: string; prompt: string; maxTokens?: number }): Promise<string>;
  generateObject<T extends z.ZodType>(req: ObjectRequest<T>): Promise<z.infer<T>>;
}

export class AiError extends Error {
  constructor(
    message: string,
    public kind: "refusal" | "rate_limit" | "auth" | "bad_request" | "unavailable" | "parse",
  ) {
    super(message);
  }
}
