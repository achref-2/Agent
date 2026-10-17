import { Router } from "express";
import { z } from "zod";
import { isoDate, parse } from "../lib/validate.js";
import { currentUser } from "../middleware/auth.js";
import { createEvent, deleteEvent, EventSchema, listEventOccurrences, updateEvent } from "../services/events.js";

export const eventsRouter = Router();

eventsRouter.get("/", async (req, res) => {
  const { from, to } = parse(z.object({ from: isoDate, to: isoDate }), req.query);
  res.json({ events: await listEventOccurrences(currentUser(req), from, to) });
});

eventsRouter.post("/", async (req, res) => {
  res.status(201).json({ event: await createEvent(currentUser(req), parse(EventSchema, req.body)) });
});

eventsRouter.patch("/:id", async (req, res) => {
  res.json({ event: await updateEvent(currentUser(req), req.params.id, parse(EventSchema.partial(), req.body)) });
});

eventsRouter.delete("/:id", async (req, res) => {
  const ev = await deleteEvent(currentUser(req), req.params.id);
  res.json({ id: String(ev._id) });
});
