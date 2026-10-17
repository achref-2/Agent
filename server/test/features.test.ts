import { describe, expect, it } from "vitest";
import { setProvider } from "../src/ai/index.js";
import { DEV_MOCK_LABEL, MockProvider } from "../src/ai/mock.js";
import { Notification } from "../src/models/misc.js";
import { Task } from "../src/models/Task.js";
import { processDueReminders } from "../src/services/reminders.js";
import { signedInAgent } from "./helpers.js";

describe("German coach", () => {
  it("replies in character, returns corrections and tracks recurring mistakes", async () => {
    const a = await signedInAgent();
    const { body } = await a.post("/api/german/sessions").send({ scenario: "landlord" });
    setProvider(
      new MockProvider(undefined, () => ({
        reply: "Guten Tag! Die Wohnung ist noch frei.",
        replyTranslation: "Hello! The flat is still available.",
        corrections: [{ original: "Ich habe Interesse für die Wohnung", corrected: "Ich habe Interesse an der Wohnung", explanation: "Interesse an + Dativ", category: "Präposition: Interesse an" }],
        naturalAlternative: "Ich interessiere mich für die Wohnung.",
        tip: null,
      })),
    );
    for (let i = 0; i < 2; i++) {
      const res = await a.post(`/api/german/sessions/${body.session.id}/messages`).send({ text: "Ich habe Interesse für die Wohnung" });
      expect(res.status).toBe(200);
      expect(res.body.turn.corrections).toHaveLength(1);
    }
    const mistakes = await a.get("/api/german/mistakes");
    expect(mistakes.body.mistakes).toEqual([expect.objectContaining({ category: "Präposition: Interesse an", count: 2 })]);
    const session = await a.get(`/api/german/sessions/${body.session.id}`);
    expect(session.body.session.messages).toHaveLength(4);
  });
});

describe("job applications", () => {
  it("tracks applications and refuses fit analysis without a real profile", async () => {
    const a = await signedInAgent();
    const created = await a.post("/api/applications").send({ company: "Acme GmbH", title: "Werkstudent Softwareentwicklung", location: "Köln", description: "Wir suchen Werkstudenten mit React und TypeScript Kenntnissen." });
    expect(created.status).toBe(201);
    const id = created.body.application.id;
    const applied = await a.patch(`/api/applications/${id}`).send({ status: "applied" });
    expect(applied.body.application.appliedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const fit = await a.post(`/api/applications/${id}/analyze`);
    expect(fit.status).toBe(400);
    expect(fit.body.error.message).toMatch(/Profile/);

    await a.patch("/api/settings").send({ profile: { background: "React and Node.js projects", skills: ["React", "TypeScript"] } });
    let prompt = "";
    setProvider(new MockProvider(undefined, (req) => { prompt = req.prompt; return { overallFit: "strong", matches: [], gaps: [], unclear: [], priorityAdvice: "Apply soon", talkingPoints: [] }; }));
    const ok = await a.post(`/api/applications/${id}/analyze`);
    expect(ok.status).toBe(200);
    expect(prompt).toContain("React and Node.js projects");
    expect((await a.get("/api/applications?status=applied")).body.applications).toHaveLength(1);
  });

  it("labels development mock output clearly", async () => {
    const a = await signedInAgent();
    const { body } = await a.post("/api/applications").send({ company: "Acme", title: "Werkstudent" });
    const draft = await a.post(`/api/applications/${body.application.id}/drafts`).send({ kind: "follow_up", language: "de" });
    expect(draft.status).toBe(201);
    expect(draft.body.draft.content).toContain(DEV_MOCK_LABEL);
  });
});

describe("reminders", () => {
  it("fires each due reminder exactly once and skips completed tasks", async () => {
    const a = await signedInAgent();
    const past = { reminderDate: "2026-01-01", reminderTime: "09:00" };
    const t1 = await a.post("/api/tasks").send({ title: "Call Krankenkasse", ...past });
    await a.post("/api/tasks").send({ title: "Already done", status: "done", ...past });
    await a.post("/api/tasks").send({ title: "Future", reminderDate: "2099-01-01" });

    expect(await processDueReminders()).toBe(1);
    expect(await processDueReminders()).toBe(0); // e.g. after a restart: no duplicate
    const notes = await a.get("/api/notifications?unread=1");
    expect(notes.body.notifications).toEqual([expect.objectContaining({ title: "Reminder: Call Krankenkasse" })]);

    // Rescheduling a reminder re-arms it.
    await a.patch(`/api/tasks/${t1.body.task.id}`).send({ reminderDate: "2026-02-01", reminderTime: "10:00" });
    expect((await Task.findById(t1.body.task.id))?.reminderSentAt).toBeNull();
    expect(await processDueReminders()).toBe(1);
    expect(await Notification.countDocuments()).toBe(2);

    await a.post("/api/notifications/read-all");
    expect((await a.get("/api/notifications?unread=1")).body.notifications).toHaveLength(0);
  });
});

describe("dashboard and settings", () => {
  it("builds the dashboard from real records", async () => {
    const a = await signedInAgent();
    const empty = await a.get("/api/dashboard");
    expect(empty.body.topPriorities).toEqual([]);
    expect(empty.body.applications).toEqual({});
    await a.post("/api/tasks").send({ title: "Due today", dueDate: empty.body.today, priority: "high" });
    await a.post("/api/applications").send({ company: "X", title: "Y", status: "interview" });
    const d = await a.get("/api/dashboard");
    expect(d.body.dueToday.map((t: { title: string }) => t.title)).toEqual(["Due today"]);
    expect(d.body.applications).toEqual({ interview: 1 });
    const briefing = await a.post("/api/dashboard/briefing");
    expect(briefing.status).toBe(200);
    expect(briefing.body.briefing.content).toContain(DEV_MOCK_LABEL);
  });

  it("lets the user inspect, edit and delete memories and validates settings", async () => {
    const a = await signedInAgent();
    const m = await a.post("/api/memory").send({ content: "I study DSP this semester", category: "study_goal" });
    await a.patch(`/api/memory/${m.body.memory.id}`).send({ content: "I study DSP and ML this semester" });
    expect((await a.get("/api/memory")).body.memories[0].content).toBe("I study DSP and ML this semester");
    await a.delete(`/api/memory/${m.body.memory.id}`).expect(200);
    expect((await a.get("/api/memory")).body.memories).toHaveLength(0);
    expect((await a.patch("/api/settings").send({ timezone: "Mars/Olympus" })).status).toBe(400);
    const s = await a.get("/api/settings");
    expect(s.body.ai).toMatchObject({ provider: "mock", devMock: true });
    expect(s.body.integrations.email.connected).toBe(false);
  });
});
