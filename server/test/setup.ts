import { afterAll, afterEach, beforeAll, inject } from "vitest";

// Environment must be set before any app module (and therefore config.ts) is imported.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = `${inject("mongoUri")}ghostmate-test-${process.pid}`;
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.ALLOW_REGISTRATION = "true";
process.env.AI_PROVIDER = "mock";
process.env.REMINDER_POLL_SECONDS = "3600";

const mongoose = (await import("mongoose")).default;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterEach(async () => {
  const { setProvider } = await import("../src/ai/index.js");
  setProvider(undefined as never);
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
