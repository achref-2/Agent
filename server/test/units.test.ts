import { describe, expect, it } from "vitest";
import { addDays, todayInTz, zonedToUtc } from "../src/lib/dates.js";
import { parseQuickAdd } from "../src/services/quickadd.js";
import { chunkPages, tokenize } from "../src/services/retrieval.js";
import { quoteFound } from "../src/services/ai-common.js";

describe("dates", () => {
  it("converts Berlin wall-clock time to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/Berlin").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "Europe/Berlin").toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
  it("computes today in a timezone and adds days across months", () => {
    expect(todayInTz("Europe/Berlin", new Date("2026-10-17T23:30:00Z"))).toBe("2026-10-18");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("quick add parser", () => {
  const now = new Date("2026-10-17T08:00:00Z"); // Saturday 10:00 in Berlin
  it("parses relative dates, times and priority", () => {
    const r = parseQuickAdd("Move DSP revision to Sunday", "Europe/Berlin", now);
    expect(r.dueDate).toBe("2026-10-18");
    expect(r.title).toBe("Move DSP revision");
    const s = parseQuickAdd("Apply for Werkstudent job at REWE next friday 5pm urgent", "Europe/Berlin", now);
    expect(s.dueDate).toBe("2026-10-23");
    expect(s.dueTime).toBe("17:00");
    expect(s.priority).toBe("urgent");
    expect(s.category).toBe("job");
    expect(s.title).toBe("Apply for Werkstudent job at REWE");
  });
  it("strips priority markers but keeps meaningful words", () => {
    expect(parseQuickAdd("Study DSP chapter 4 today urgent", "Europe/Berlin", now).title).toBe("Study DSP chapter 4");
    const imp = parseQuickAdd("Read important email from the Ausländerbehörde", "Europe/Berlin", now);
    expect(imp.title).toBe("Read important email from the Ausländerbehörde");
    expect(imp.priority).toBe("high");
  });
  it("keeps undated tasks undated", () => {
    const r = parseQuickAdd("Buy a Deutschlandticket", "Europe/Berlin", now);
    expect(r.dueDate).toBeNull();
    expect(r.reminderDate).toBeUndefined();
  });
});

describe("retrieval helpers", () => {
  it("tokenizes German and English and drops stopwords", () => {
    expect(tokenize("Die Fourier-Transformation and the signals")).toHaveLength(3);
    expect(tokenize("signals")).toEqual(tokenize("signal"));
    expect(tokenize("Abtastungen")).toEqual(tokenize("Abtastung"));
  });
  it("chunks long pages with page numbers", () => {
    const long = "Sentence about sampling. ".repeat(120);
    const chunks = chunkPages(["short page", long]);
    expect(chunks[0]).toEqual({ page: 1, text: "short page" });
    expect(chunks.slice(1).every((c) => c.page === 2 && c.text.length <= 1000)).toBe(true);
    expect(chunks.length).toBeGreaterThan(3);
  });
  it("verifies quotes whitespace-insensitively", () => {
    expect(quoteFound("Nyquist  rate is twice", "The Nyquist rate is twice the bandwidth")).toBe(true);
    expect(quoteFound("made up sentence here", "The Nyquist rate is twice the bandwidth")).toBe(false);
  });
});
