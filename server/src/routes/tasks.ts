import { Router } from "express";
import { z } from "zod";
import { todayInTz } from "../lib/dates.js";
import { parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { parseQuickAdd } from "../services/quickadd.js";
import { completeTask, createTask, deleteTask, getTask, listTasks, TaskCreateSchema, TaskListSchema, TaskUpdateSchema, updateTask } from "../services/tasks.js";

export const tasksRouter = Router();

tasksRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const tasks = await listTasks(user, parse(TaskListSchema, req.query));
  res.json({ tasks, today: todayInTz(user.timezone) });
});

tasksRouter.post("/", async (req, res) => {
  const task = await createTask(currentUser(req), parse(TaskCreateSchema, req.body));
  res.status(201).json({ task });
});

// Natural-language quick add, parsed locally (no AI call): "Email professor tomorrow 10am !high"
tasksRouter.post("/quick", async (req, res) => {
  const user = currentUser(req);
  const { text, preview } = parse(z.object({ text: z.string().trim().min(1).max(300), preview: z.boolean().optional() }), req.body);
  const { reminderAt: _r, ...parsed } = parseQuickAdd(text, user.timezone);
  if (preview) return res.json({ parsed });
  const task = await createTask(user, parsed, "quick_add");
  res.status(201).json({ task, parsed });
});

// Create several tasks at once (e.g. from a document analysis or a revision plan).
tasksRouter.post("/bulk", async (req, res) => {
  const user = currentUser(req);
  const { tasks, source } = parse(
    z.object({ tasks: z.array(TaskCreateSchema).min(1).max(50), source: z.enum(["document", "study_plan", "manual"]).default("manual") }),
    req.body,
  );
  const created = [];
  for (const t of tasks) created.push(await createTask(user, t, source));
  res.status(201).json({ tasks: created });
});

tasksRouter.get("/:id", async (req, res) => {
  res.json({ task: await getTask(currentUser(req), req.params.id) });
});

tasksRouter.patch("/:id", async (req, res) => {
  res.json({ task: await updateTask(currentUser(req), req.params.id, parse(TaskUpdateSchema, req.body)) });
});

tasksRouter.post("/:id/complete", async (req, res) => {
  res.json({ task: await completeTask(currentUser(req), req.params.id) });
});

tasksRouter.delete("/:id", async (req, res) => {
  res.json(await deleteTask(currentUser(req), req.params.id));
});
