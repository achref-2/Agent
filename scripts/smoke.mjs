// Browser walkthrough of every page against a running dev stack (AI_PROVIDER=mock, empty database).
// Usage: npm i -D playwright && npx playwright install chromium && node scripts/smoke.mjs
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.SHOTS_DIR ?? path.join(os.tmpdir(), "ghostmate-shots");
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const step = async (name, fn) => { while (await page.getByRole("dialog").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); if (await page.getByRole("dialog").count()) break; } try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, e.message.split("\n")[0]); errors.push(`${name}: ${e.message.split("\n")[0]}`); await shot(`fail-${name.replace(/\W+/g, "_")}`); } };

await step("register first user", async () => {
  await page.goto(BASE);
  await page.getByRole("heading", { name: "Create your account" }).waitFor({ timeout: 10000 }).catch(async () => {
    // already registered: sign in
  });
  if (await page.getByLabel("Name").count()) {
    await page.getByLabel("Name").fill("Ghost");
    await page.getByLabel("Email").fill("ghost@example.com");
    await page.getByLabel("Password").fill("supersecret123");
    await page.getByRole("button", { name: "Create account" }).click();
  } else {
    await page.getByLabel("Email").fill("ghost@example.com");
    await page.getByLabel("Password").fill("supersecret123");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await page.getByRole("heading", { name: /Guten/ }).waitFor();
});

await step("quick add tasks", async () => {
  for (const t of ["Remind me to email my professor tomorrow at 10 !high", "Study DSP chapter 4 today urgent", "Practice German vocab friday", "Apply for Werkstudent job at REWE digital next monday", "Pay Rundfunkbeitrag yesterday"]) {
    await page.getByLabel("Quick add a task").fill(t);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForTimeout(400);
  }
  await page.getByText("Email my professor").first().waitFor();
  await page.getByText(/Overdue \(1\)/).waitFor();
  await shot("01-dashboard");
});

await step("briefing (dev mock labelled)", async () => {
  await page.getByRole("button", { name: /Generate/ }).click();
  await page.getByText("Dev mock").first().waitFor();
});

await step("calendar month view + create event", async () => {
  await page.getByRole("link", { name: "Tasks & Calendar" }).click();
  await page.getByRole("heading", { name: "Todos" }).waitFor();
  await page.getByRole("button", { name: "Event", exact: true }).click();
  await page.getByLabel("Title").fill("DSP lecture");
  await page.getByRole("dialog").getByLabel("Start", { exact: true }).fill("10:00");
  await page.getByRole("dialog").getByLabel("End", { exact: true }).fill("11:30");
  await page.getByLabel("Location").fill("Campus Deutz");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Event added").waitFor();
  await page.waitForTimeout(500);
  await shot("02-calendar-month");
  await page.getByRole("tablist", { name: "Calendar view" }).getByRole("tab", { name: "Week" }).click();
  await page.waitForTimeout(300);
  await shot("03-calendar-week");
  await page.getByRole("tablist", { name: "Calendar view" }).getByRole("tab", { name: "List" }).click();
  await page.getByLabel("Search tasks").fill("German");
  await page.getByText("Practice German vocab").first().waitFor();
});

await step("complete a task from the side panel", async () => {
  await page.getByRole("tablist", { name: "Calendar view" }).getByRole("tab", { name: "Month" }).click();
  await page.getByRole("button", { name: /^Complete "Study DSP chapter 4"/ }).first().click();
  await page.getByText(/Completed "Study DSP chapter 4"/).waitFor();
});

await step("assistant: tool call creates real task", async () => {
  await page.getByRole("link", { name: "AI Assistant" }).click();
  await page.getByLabel("Message GhostMate").fill("Remind me to call the Krankenkasse about my insurance card");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText(/Tool results:/).first().waitFor({ timeout: 15000 });
  await page.getByText(/Created task "call the Krankenkasse/).filter({ visible: true }).first().waitFor();
  await page.getByRole("button", { name: /1 tool call/ }).first().click();
  await page.getByText(/create_task\(/).filter({ visible: true }).first().waitFor();
  await shot("04-assistant");
  await page.getByLabel("Message GhostMate").fill("What are my most urgent tasks?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText(/Found \d+ task/).filter({ visible: true }).first().waitFor({ timeout: 15000 });
});

await step("study: upload PDF and ask", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of ["DSP Lecture 4: Sampling", "The Nyquist rate is twice the highest frequency in the signal.", "Aliasing occurs when sampling below the Nyquist rate."]) {
    doc.addPage().drawText(text, { x: 40, y: 760, size: 12, font });
  }
  fs.writeFileSync(path.join(OUT, "lecture.pdf"), await doc.save());
  await page.getByRole("link", { name: "Study Workspace" }).click();
  await page.getByRole("button", { name: "Upload a PDF" }).click();
  await page.locator("#file-input").setInputFiles(path.join(OUT, "lecture.pdf"));
  await page.getByLabel("Course (optional)").fill("Digital Signal Processing");
  await page.getByRole("dialog").getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByText("lecture", { exact: true }).first().waitFor();
  await page.getByLabel("Question about your lecture materials").fill("What is the Nyquist rate?");
  await page.getByRole("button", { name: "Ask" }).click();
  await page.getByText(/Searched \d+ relevant passage/).waitFor({ timeout: 15000 });
  await shot("05-study");
  await page.getByRole("tab", { name: "Quiz & cards" }).click();
  await page.getByRole("button", { name: "Generate" }).click();
  await page.getByText(/1\. /).first().waitFor({ timeout: 15000 });
});

await step("german coach conversation", async () => {
  await page.getByRole("link", { name: "German Coach" }).click();
  await page.getByRole("button", { name: /landlord/i }).click();
  await page.getByLabel("Your message in German").fill("Ich habe Interesse für die Wohnung");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(1500);
  await shot("06-german");
  await page.getByRole("tab", { name: "Mistakes & exercises" }).click();
  await page.getByRole("heading", { name: "Recurring mistakes" }).waitFor();
});

await step("jobs: add and update application", async () => {
  await page.getByRole("link", { name: "Job Applications" }).click();
  await page.getByRole("button", { name: "Add application" }).first().click();
  await page.getByLabel("Company").fill("REWE digital");
  await page.getByLabel("Job title").fill("Werkstudent Frontend (React)");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "Werkstudent Frontend (React)" }).waitFor();
  await page.getByLabel("Status", { exact: true }).selectOption("applied");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Application saved").waitFor();
  await page.getByRole("tab", { name: /Fit analysis/ }).click();
  await page.getByRole("button", { name: "Compare with my profile" }).click();
  await page.getByText(/Profile first/).waitFor();
  await shot("07-jobs");
});

await step("documents: paste letter, analyse, create tasks", async () => {
  await page.getByRole("link", { name: "Documents" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Paste text" }).click();
  await page.getByLabel("Text").fill("Sehr geehrte Frau Ghost, bitte reichen Sie bis zum 30.11.2026 Ihre Immatrikulationsbescheinigung ein. Mit freundlichen Grüßen, Techniker Krankenkasse");
  await page.getByLabel("Title (optional)").fill("TK Brief");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "TK Brief" }).waitFor();
  await page.getByRole("button", { name: /Explain & extract actions/ }).click();
  await page.getByText("In plain English").waitFor({ timeout: 15000 });
  await shot("08-documents");
});

await step("settings: memory add/edit/delete + toggle", async () => {
  await page.getByRole("link", { name: "Memory & Settings" }).click();
  await page.getByLabel("New memory").fill("I prefer concise answers with bullet points");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("I prefer concise answers").waitFor();
  await page.getByRole("button", { name: "Edit memory" }).first().click();
  await page.getByLabel("Memory content").fill("I prefer concise answers");
  await page.getByRole("button", { name: "Save memory" }).click();
  await page.getByText("Added by you").first().waitFor();
  await shot("09-settings");
});

await step("light theme", async () => {
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForTimeout(500);
  await shot("10-dashboard-light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
});

await step("mobile layout", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/");
  await page.getByRole("heading", { name: /Guten/ }).waitFor();
  await shot("11-mobile-dashboard");
  await page.getByRole("button", { name: "Open menu" }).click();
  await shot("12-mobile-menu");
  await page.getByRole("link", { name: "Tasks & Calendar" }).click();
  await page.waitForTimeout(500);
  await shot("13-mobile-calendar");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error("horizontal page overflow on mobile");
  await page.goto(BASE + "/assistant");
  await page.waitForTimeout(500);
  await shot("14-mobile-assistant");
});

await step("logout", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
});

await browser.close();
console.log(errors.length ? `\nERRORS:\n${errors.join("\n")}` : "\nNo errors");
