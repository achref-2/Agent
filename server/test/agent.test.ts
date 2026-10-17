import { describe, expect, it } from "vitest";
import { setProvider } from "../src/ai/index.js";
import { MockProvider } from "../src/ai/mock.js";
import type { ChatRequest, ChatResponse } from "../src/ai/provider.js";
import { Task } from "../src/models/Task.js";
import { signedInAgent } from "./helpers.js";

/** Scripted model: returns each response in order and records every request it receives. */
function scripted(responses: ((req: ChatRequest) => ChatResponse)[]) {
  const requests: ChatRequest[] = [];
  let i = 0;
  setProvider(
    new MockProvider((req) => {
      requests.push(structuredClone(req));
      const r = responses[Math.min(i++, responses.length - 1)];
      return r(req);
    }),
  );
  return requests;
}
const text = (t: string) => (): ChatResponse => ({ content: [{ type: "text", text: t }], stopReason: "end_turn", model: "test" });
const tool = (name: string, input: unknown, id = `t_${name}`) => (): ChatResponse => ({
  content: [{ type: "tool_use", id, name, input }],
  stopReason: "tool_use",
  model: "test",
});
const lastToolResult = (req: ChatRequest) => {
  const last = req.messages[req.messages.length - 1];
  const block = last.content.find((b) => b.type === "tool_result");
  return block && block.type === "tool_result" ? { ...block, parsed: JSON.parse(block.content) } : null;
};

describe("agent", () => {
  it("calls tools that change real database records and reports them", async () => {
    const a = await signedInAgent();
    const requests = scripted([tool("create_task", { title: "Email professor", dueDate: "2026-10-18", reminderDate: "2026-10-18", reminderTime: "09:00" }), text("Done: I added the task.")]);
    const res = await a.post("/api/assistant/chat").send({ message: "Remind me to email my professor tomorrow." });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Done: I added the task.");
    expect(res.body.toolActivity).toEqual([expect.objectContaining({ name: "create_task", ok: true })]);
    const tasks = await Task.find({});
    expect(tasks).toHaveLength(1);
    expect(tasks[0].source).toBe("assistant");
    expect(tasks[0].reminderAt?.toISOString()).toBe("2026-10-18T07:00:00.000Z");
    // The model received the real tool result, and a system prompt with today's date and tool definitions.
    expect(lastToolResult(requests[1])?.parsed.ok).toBe(true);
    expect(requests[0].system).toMatch(/Today is \w+day, \d{4}-\d{2}-\d{2}/);
    expect(requests[0].tools?.map((t) => t.name)).toContain("retrieve_document_passages");

    // The conversation persists, and later turns include earlier messages as history.
    scripted([text("Second answer")]);
    const again = await a.post("/api/assistant/chat").send({ message: "Thanks", conversationId: res.body.conversationId });
    expect(again.status).toBe(200);
    const convo = await a.get(`/api/assistant/conversations/${res.body.conversationId}`);
    expect(convo.body.conversation.messages).toHaveLength(4);
  });

  it("returns honest errors for invalid tool input and unknown tools", async () => {
    const a = await signedInAgent();
    const requests = scripted([tool("update_task", { id: "nope" }), tool("drop_database", {}), text("I could not do that.")]);
    const res = await a.post("/api/assistant/chat").send({ message: "Move my task" });
    expect(res.body.toolActivity.map((t: { ok: boolean }) => t.ok)).toEqual([false, false]);
    expect(lastToolResult(requests[1])?.parsed.error).toMatch(/Invalid input/);
    expect(lastToolResult(requests[2])?.parsed.error).toMatch(/Unknown tool/);
  });

  it("never touches another user's records", async () => {
    const owner = await signedInAgent("Owner");
    const other = await signedInAgent("Other");
    const { body } = await owner.post("/api/tasks").send({ title: "Owner's task" });
    const requests = scripted([tool("complete_task", { id: body.task.id }), text("ok")]);
    await other.post("/api/assistant/chat").send({ message: "complete it" });
    expect(lastToolResult(requests[1])?.parsed).toEqual({ ok: false, error: "Task not found" });
    expect((await Task.findById(body.task.id))?.status).toBe("todo");
  });

  it("requires explicit confirmation before deleting", async () => {
    const a = await signedInAgent();
    const other = await signedInAgent("Other");
    const { body } = await a.post("/api/tasks").send({ title: "Old task" });
    scripted([tool("delete_task", { id: body.task.id }), text("It is waiting for your confirmation.")]);
    const res = await a.post("/api/assistant/chat").send({ message: "Delete my old task" });
    const pendingId = res.body.toolActivity[0].pendingActionId;
    expect(pendingId).toBeTruthy();
    expect(await Task.countDocuments()).toBe(1); // not deleted yet

    expect((await other.post(`/api/assistant/actions/${pendingId}`).send({ approve: true })).status).toBe(404);
    const confirm = await a.post(`/api/assistant/actions/${pendingId}`).send({ approve: true });
    expect(confirm.body.status).toBe("confirmed");
    expect(await Task.countDocuments()).toBe(0);
    expect((await a.post(`/api/assistant/actions/${pendingId}`).send({ approve: true })).status).toBe(409);
  });

  it("stops at the iteration limit instead of looping forever", async () => {
    const a = await signedInAgent();
    const requests = scripted([tool("list_tasks", {})]);
    const res = await a.post("/api/assistant/chat").send({ message: "loop" });
    expect(res.body.stopped).toBe("iteration_limit");
    expect(requests).toHaveLength(6);
  });

  it("respects the memory setting", async () => {
    const a = await signedInAgent();
    await a.patch("/api/settings").send({ memoryEnabled: false });
    const requests = scripted([tool("save_memory", { content: "Prefers short answers", category: "communication_style" }), text("ok")]);
    await a.post("/api/assistant/chat").send({ message: "Remember that I prefer short answers" });
    expect(lastToolResult(requests[1])?.parsed.error).toMatch(/Memory is turned off/);
    expect((await a.get("/api/memory")).body.memories).toHaveLength(0);

    await a.patch("/api/settings").send({ memoryEnabled: true });
    const r2 = scripted([tool("save_memory", { content: "Prefers short answers", category: "communication_style" }), text("ok")]);
    await a.post("/api/assistant/chat").send({ message: "Remember that I prefer short answers" });
    expect((await a.get("/api/memory")).body.memories).toHaveLength(1);
    scripted([text("hi")]);
    const r3 = scripted([text("hi")]);
    await a.post("/api/assistant/chat").send({ message: "hello" });
    expect(r3[0].system).toContain("Prefers short answers");
    expect(r2).toHaveLength(2);
  });

  it("reports a clear error when AI is not configured", async () => {
    const a = await signedInAgent();
    setProvider(null);
    const res = await a.post("/api/assistant/chat").send({ message: "hi" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("ai_not_configured");
    // Non-AI features keep working.
    expect((await a.post("/api/tasks").send({ title: "Still works" })).status).toBe(201);
  });
});
