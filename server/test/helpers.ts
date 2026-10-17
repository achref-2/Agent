import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();

let n = 0;

/** Registers a fresh user and returns an agent that carries the session cookie and CSRF header. */
export async function signedInAgent(name = "Test User") {
  const agent = request.agent(app);
  const email = `user${++n}-${Date.now()}@example.com`;
  const res = await agent.post("/api/auth/register").set("X-GhostMate", "1").send({ email, password: "correct horse battery", name });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const wrap = {
    get: (url: string) => agent.get(url),
    post: (url: string) => agent.post(url).set("X-GhostMate", "1"),
    patch: (url: string) => agent.patch(url).set("X-GhostMate", "1"),
    delete: (url: string) => agent.delete(url).set("X-GhostMate", "1"),
    user: res.body.user as { id: string; email: string; timezone: string },
    email,
  };
  return wrap;
}

export async function makePdf(pages: string[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage();
    let y = 760;
    for (const line of text.split("\n")) {
      if (line) page.drawText(line, { x: 40, y, size: 11, font });
      y -= 16;
    }
  }
  return Buffer.from(await doc.save());
}
