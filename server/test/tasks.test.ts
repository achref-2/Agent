import { describe, expect, it } from "vitest";
import { addDays, todayInTz } from "../src/lib/dates.js";
import { signedInAgent } from "./helpers.js";

describe("tasks", () => {
  it("creates, reads, updates, completes, searches and deletes tasks", async () => {
    const a = await signedInAgent();
    const today = todayInTz("Europe/Berlin");
    const created = await a.post("/api/tasks").send({ title: "Study DSP chapter 3", category: "university", priority: "high", dueDate: today });
    expect(created.status).toBe(201);
    const id = created.body.task.id;

    const patched = await a.patch(`/api/tasks/${id}`).send({ dueDate: addDays(today, 2), dueTime: "14:00" });
    expect(patched.body.task.dueDate).toBe(addDays(today, 2));

    const search = await a.get("/api/tasks?search=dsp");
    expect(search.body.tasks.map((t: { id: string }) => t.id)).toEqual([id]);

    const done = await a.post(`/api/tasks/${id}/complete`);
    expect(done.body.task.status).toBe("done");
    expect(done.body.task.completedAt).toBeTruthy();
    expect((await a.get("/api/tasks?status=open")).body.tasks).toHaveLength(0);

    expect((await a.delete(`/api/tasks/${id}`)).status).toBe(200);
    expect((await a.get(`/api/tasks/${id}`)).status).toBe(404);
  });

  it("ranks overdue and urgent tasks first and filters overdue", async () => {
    const a = await signedInAgent();
    const today = todayInTz("Europe/Berlin");
    await a.post("/api/tasks").send({ title: "Someday", priority: "low" });
    await a.post("/api/tasks").send({ title: "Overdue form", dueDate: addDays(today, -2) });
    await a.post("/api/tasks").send({ title: "Urgent today", priority: "urgent", dueDate: today });
    const ranked = await a.get("/api/tasks?sort=urgency");
    expect(ranked.body.tasks.map((t: { title: string }) => t.title)).toEqual(["Overdue form", "Urgent today", "Someday"]);
    const overdue = await a.get("/api/tasks?overdue=true");
    expect(overdue.body.tasks.map((t: { title: string }) => t.title)).toEqual(["Overdue form"]);
  });

  it("validates input", async () => {
    const a = await signedInAgent();
    const res = await a.post("/api/tasks").send({ title: "", dueDate: "tomorrow" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect((await a.get("/api/tasks/not-an-id")).status).toBe(404);
  });

  it("isolates tasks between users", async () => {
    const a = await signedInAgent("A");
    const b = await signedInAgent("B");
    const { body } = await a.post("/api/tasks").send({ title: "Private task" });
    const id = body.task.id;
    expect((await b.get(`/api/tasks/${id}`)).status).toBe(404);
    expect((await b.patch(`/api/tasks/${id}`).send({ title: "hacked" })).status).toBe(404);
    expect((await b.delete(`/api/tasks/${id}`)).status).toBe(404);
    expect((await b.get("/api/tasks?status=all")).body.tasks).toHaveLength(0);
    expect((await a.get(`/api/tasks/${id}`)).body.task.title).toBe("Private task");
  });

  it("quick-adds tasks from natural language without AI", async () => {
    const a = await signedInAgent();
    const res = await a.post("/api/tasks/quick").send({ text: "Remind me to email my professor tomorrow at 10am !high" });
    expect(res.status).toBe(201);
    const today = todayInTz("Europe/Berlin");
    expect(res.body.task.title).toBe("Email my professor");
    expect(res.body.task.dueDate).toBe(addDays(today, 1));
    expect(res.body.task.dueTime).toBe("10:00");
    expect(res.body.task.priority).toBe("high");
    expect(res.body.task.category).toBe("university");
    expect(res.body.task.reminderAt).toBeTruthy();
  });

  it("creates tasks in bulk and stores events with weekly recurrence", async () => {
    const a = await signedInAgent();
    const bulk = await a.post("/api/tasks/bulk").send({ tasks: [{ title: "One" }, { title: "Two" }], source: "study_plan" });
    expect(bulk.body.tasks).toHaveLength(2);
    await a.post("/api/events").send({ title: "DSP lecture", date: "2026-10-05", startTime: "10:00", repeatWeeklyUntil: "2026-10-26" });
    const ev = await a.get("/api/events?from=2026-10-10&to=2026-10-31");
    expect(ev.body.events.map((e: { date: string }) => e.date)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });
});
