import { z } from "zod";
import type { AiBlock, ChatRequest, ChatResponse, LLMProvider, ObjectRequest } from "./provider.js";

// Development-only provider. Every answer it gives is prefixed with DEV_MOCK_LABEL, and the UI shows
// a "development mode" banner, so mock output can never be mistaken for real AI output. It is also
// used by the automated tests with scripted responses.
export const DEV_MOCK_LABEL = "[Dev mock: no AI model connected]";

type ChatScript = (req: ChatRequest) => ChatResponse | Promise<ChatResponse>;
type ObjectScript = (req: ObjectRequest<z.ZodType>) => unknown;

let idCounter = 0;
const nextId = () => `mock_tool_${++idCounter}`;

function lastUserBlocks(req: ChatRequest): AiBlock[] {
  const last = [...req.messages].reverse().find((m) => m.role === "user");
  return last?.content ?? [];
}

/** Heuristic stand-in for a model so the tool plumbing can be exercised without an API key. */
export const devChatScript: ChatScript = (req) => {
  const blocks = lastUserBlocks(req);
  const results = blocks.filter((b) => b.type === "tool_result");
  if (results.length) {
    const text = results.map((r) => (r.type === "tool_result" ? r.content.slice(0, 600) : "")).join("\n");
    return { content: [{ type: "text", text: `${DEV_MOCK_LABEL}\nTool results:\n${text}` }], stopReason: "end_turn", model: "dev-mock" };
  }
  const text = blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ");
  const lower = text.toLowerCase();
  const tools = new Set(req.tools?.map((t) => t.name));
  const call = (name: string, input: unknown): ChatResponse => ({
    content: [{ type: "text", text: `${DEV_MOCK_LABEL} Calling ${name}.` }, { type: "tool_use", id: nextId(), name, input }],
    stopReason: "tool_use",
    model: "dev-mock",
  });
  const remind = /^(remind me to|add (a )?task:?|todo:?)\s+(.+)/i.exec(text.trim());
  if (remind && tools.has("create_task")) return call("create_task", { title: remind[3].slice(0, 200) });
  if (/\b(remember that|remember:)\s+/i.test(text) && tools.has("save_memory"))
    return call("save_memory", { content: text.replace(/.*remember(:| that)\s+/i, "").slice(0, 900), category: "preference" });
  if (/(task|urgent|due|deadline|todo|plan my day)/.test(lower) && tools.has("list_tasks")) return call("list_tasks", { status: "open", sort: "urgency", limit: 10 });
  if (/(application|job)/.test(lower) && tools.has("search_applications")) return call("search_applications", {});
  return {
    content: [{ type: "text", text: `${DEV_MOCK_LABEL}\nI received: "${text.slice(0, 300)}". Connect an Anthropic API key for real answers.` }],
    stopReason: "end_turn",
    model: "dev-mock",
  };
};

/** Builds a schema-valid placeholder object, clearly labelled as mock output. */
function placeholder(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const anyOf = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[] | undefined;
  if (anyOf?.length) return placeholder(anyOf.find((s) => s.type !== "null") ?? anyOf[0]);
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  switch (type) {
    case "string":
      return schema.format === "date" ? "2099-01-01" : `${DEV_MOCK_LABEL} placeholder`;
    case "number":
    case "integer":
      return typeof schema.minimum === "number" ? schema.minimum : 0;
    case "boolean":
      return false;
    case "array":
      return typeof schema.minItems === "number" && schema.minItems > 0 ? [placeholder(schema.items as Record<string, unknown>)] : [];
    case "object": {
      const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, placeholder(v)]));
    }
    case "null":
      return null;
    default:
      return null;
  }
}

export const devObjectScript: ObjectScript = (req) => placeholder(z.toJSONSchema(req.schema, { io: "input" }) as Record<string, unknown>);

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "dev-mock";
  readonly isMock = true;
  constructor(
    private chatScript: ChatScript = devChatScript,
    private objectScript: ObjectScript = devObjectScript,
  ) {}

  async chat(req: ChatRequest) {
    return this.chatScript(req);
  }

  async generateText(req: { system: string; prompt: string }) {
    const res = await this.chat({ system: req.system, messages: [{ role: "user", content: [{ type: "text", text: req.prompt }] }] });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    return text.startsWith(DEV_MOCK_LABEL) ? text : `${DEV_MOCK_LABEL}\n${text}`;
  }

  async generateObject<T extends z.ZodType>(req: ObjectRequest<T>): Promise<z.infer<T>> {
    return req.schema.parse(await this.objectScript(req as unknown as ObjectRequest<z.ZodType>));
  }
}
