import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { app, signedInAgent } from "./helpers.js";

describe("auth", () => {
  it("registers, reads /me, logs out and logs back in", async () => {
    const a = await signedInAgent("Ghost");
    const me = await a.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe("Ghost");
    expect(me.body.user.passwordHash).toBeUndefined();

    await a.post("/api/auth/logout").expect(200);
    expect((await a.get("/api/auth/me")).status).toBe(401);

    const login = await request(app).post("/api/auth/login").set("X-GhostMate", "1").send({ email: a.email, password: "correct horse battery" });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"][0]).toMatch(/gm_session=.*HttpOnly.*SameSite=Strict/i);
  });

  it("rejects wrong passwords and short passwords", async () => {
    const a = await signedInAgent();
    const bad = await request(app).post("/api/auth/login").set("X-GhostMate", "1").send({ email: a.email, password: "wrong password!" });
    expect(bad.status).toBe(401);
    const short = await request(app).post("/api/auth/register").set("X-GhostMate", "1").send({ email: "x@example.com", password: "short", name: "X" });
    expect(short.status).toBe(400);
  });

  it("closes registration after the first user unless ALLOW_REGISTRATION is true", async () => {
    await signedInAgent();
    config.ALLOW_REGISTRATION = false;
    try {
      const res = await request(app).post("/api/auth/register").set("X-GhostMate", "1").send({ email: "late@example.com", password: "long enough password", name: "Late" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("registration_closed");
    } finally {
      config.ALLOW_REGISTRATION = true;
    }
  });

  it("requires a session for protected routes", async () => {
    expect((await request(app).get("/api/tasks")).status).toBe(401);
    const forged = await request(app).get("/api/tasks").set("Cookie", "gm_session=not-a-jwt");
    expect(forged.status).toBe(401);
  });

  it("blocks state-changing requests without the CSRF header", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "whatever123" });
    expect(res.status).toBe(403);
  });
});
