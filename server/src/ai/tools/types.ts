import type { z } from "zod";
import type { UserDoc } from "../../models/User.js";

export interface ToolContext {
  user: UserDoc;
  today: string; // YYYY-MM-DD in the user's timezone
}

export type ToolResult =
  | { ok: true; summary: string; data?: unknown }
  | { ok: false; error: string };

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** Destructive tools never run directly: they create a pending action the user must confirm. */
  destructive?: boolean;
  /** Human-readable description of what will happen, shown on the confirmation button. */
  describe?: (input: z.infer<S>, ctx: ToolContext) => Promise<string>;
  /** Whether the tool may run for this user right now (e.g. memory disabled in settings). */
  enabled?: (ctx: ToolContext) => boolean | string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
}

export function defineTool<S extends z.ZodType>(t: AgentTool<S>): AgentTool<S> {
  return t;
}
