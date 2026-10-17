import { aiStatus, config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { startReminderScheduler } from "./services/reminders.js";

async function main() {
  await connectDb(config.MONGODB_URI);
  const stopReminders = startReminderScheduler(config.REMINDER_POLL_SECONDS);
  const server = createApp().listen(config.PORT, () => {
    const ai = aiStatus();
    logger.info("GhostMate server listening", { port: config.PORT, env: config.NODE_ENV, ai: ai.configured ? `${ai.provider}:${ai.model}` : "not configured" });
    if (ai.devMock) logger.warn("AI_PROVIDER=mock: AI answers are placeholders for development, not real model output.");
  });
  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
    stopReminders();
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start", { err: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
