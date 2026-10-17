import { describe, expect, it } from "vitest";
import { addDays, relativeDay, startOfWeek } from "../lib/dates";

describe("client date helpers", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("finds Monday as the start of the week", () => {
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12"); // Sunday -> previous Monday
    expect(startOfWeek("2026-10-12")).toBe("2026-10-12");
  });
  it("labels relative days", () => {
    expect(relativeDay("2026-10-17", "2026-10-17")).toBe("Today");
    expect(relativeDay("2026-10-18", "2026-10-17")).toBe("Tomorrow");
    expect(relativeDay("2026-10-10", "2026-10-17")).toMatch(/overdue/);
  });
});
