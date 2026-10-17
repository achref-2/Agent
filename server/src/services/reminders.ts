import { logger } from "../lib/logger.js";
import { Notification } from "../models/misc.js";
import { Task } from "../models/Task.js";

// Reminders are stored on tasks in MongoDB, so they survive restarts. Every poll claims due
// reminders atomically (reminderSentAt: null -> now), so each reminder fires once even if several
// server instances run. Reminders missed while the server was down fire on the next poll.
export async function processDueReminders(now = new Date()) {
  let fired = 0;
  for (;;) {
    const task = await Task.findOneAndUpdate(
      { reminderAt: { $ne: null, $lte: now }, reminderSentAt: null, status: { $in: ["todo", "in_progress"] } },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after" },
    );
    if (!task) break;
    try {
      await Notification.create({
        userId: task.userId,
        kind: "reminder",
        title: `Reminder: ${task.title}`,
        body: task.dueDate ? `Due ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ""}` : "",
        taskId: task._id,
        dedupeKey: `task:${task._id}:${task.reminderAt!.toISOString()}`,
      });
      fired++;
    } catch (err) {
      // Duplicate key = this reminder occurrence was already delivered.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  return fired;
}

export function startReminderScheduler(intervalSeconds: number) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await processDueReminders();
      if (n) logger.info("reminders fired", { count: n });
    } catch (err) {
      logger.error("reminder scheduler error", { err: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
