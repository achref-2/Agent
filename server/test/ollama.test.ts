import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { OllamaProvider } from "../src/ai/ollama.js";
import { AiError } from "../src/ai/provider.js";

// A stand-in for Ollama's /api/chat that replays queued responses and records requests.
const requests: Record<string, unknown>[] = [];
let replies: { status?: number; body: unknown }[] = [];
let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push(JSON.parse(raw));
      const next = replies.shift() ?? { status: 500, body: { error: "no reply queued" } };
      res.writeHead(next.status ?? 200, { "content-type": "application/json" });
      res.end(typeof next.body === "string" ? next.body : JSON.stringify(next.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const reply = (message: Record<string, unknown>, done_reason = "stop") => ({ body: { model: "qwen2.5:7b", message: { role: "assistant", content: "", ...message }, done_reason } });

describe("Ollama provider", () => {
  it("maps tool calls and tool results in both directions", async () => {
    requests.length = 0;
    replies = [reply({ tool_calls: [{ function: { name: "create_task", arguments: { title: "Call TK" } } }] })];
    const p = new OllamaProvider(baseUrl, "qwen2.5:7b", 8192);
    const res = await p.chat({
      system: "sys",
      messages: [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "list_tasks", input: {} }] },
        { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "{\"ok\":true}" }] },
      ],
      tools: [{ name: "create_task", description: "Create", inputSchema: { type: "object" } }],
    });
    expect(res.stopReason).toBe("tool_use");
    expect(res.content[0]).toMatchObject({ type: "tool_use", name: "create_task", input: { title: "Call TK" } });
    const sent = requests[0] as { messages: { role: string; tool_name?: string }[]; tools: unknown[]; stream: boolean };
    expect(sent.stream).toBe(false);
    expect(sent.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(sent.messages[3].tool_name).toBe("list_tasks");
    expect(sent.tools).toHaveLength(1);
  });

  it("validates structured output and repairs it once", async () => {
    requests.length = 0;
    replies = [reply({ content: "{\"summary\": 5}" }), reply({ content: "{\"summary\": \"ok\"}" })];
    const p = new OllamaProvider(baseUrl, "qwen2.5:7b", 8192);
    const out = await p.generateObject({ system: "s", prompt: "p", schema: z.object({ summary: z.string() }) });
    expect(out).toEqual({ summary: "ok" });
    expect(requests).toHaveLength(2);
    expect((requests[0] as { format: { type: string } }).format.type).toBe("object");
  });

  it("gives up with a clear error instead of returning bad data", async () => {
    replies = [reply({ content: "not json" }), reply({ content: "still not" })];
    const p = new OllamaProvider(baseUrl, "qwen2.5:7b", 8192);
    await expect(p.generateObject({ system: "s", prompt: "p", schema: z.object({ a: z.string() }) })).rejects.toMatchObject({ kind: "parse" });
  });

  it("explains a missing model and an unreachable server", async () => {
    replies = [{ status: 404, body: { error: "model 'qwen2.5:7b' not found" } }];
    await expect(new OllamaProvider(baseUrl, "qwen2.5:7b", 8192).generateText({ system: "s", prompt: "p" })).rejects.toThrow(/ollama pull qwen2.5:7b/);
    const err = await new OllamaProvider("http://127.0.0.1:1", "m", 8192).generateText({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toMatch(/Make sure Ollama is running/);
  });
});
