import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Comma-separated list of origins allowed to call the API (the Vite dev server in development).
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  // Registration is always allowed while no user exists; afterwards only if this is true.
  ALLOW_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // "anthropic" (default), "mock" (clearly labelled development mode) or "none".
  AI_PROVIDER: z.enum(["anthropic", "mock", "none"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  // "default" enables Anthropic's server-side refusal fallback; "off" disables it.
  ANTHROPIC_FALLBACKS: z.enum(["default", "off"]).default("default"),
  AGENT_MAX_ITERATIONS: z.coerce.number().int().min(1).max(20).default(6),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(50).default(12),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(20),
  REMINDER_POLL_SECONDS: z.coerce.number().int().min(5).default(30),
});

export type Config = z.infer<typeof EnvSchema>;

function load(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  return parsed.data;
}

export const config = load();

export function aiStatus(): { provider: Config["AI_PROVIDER"]; configured: boolean; model: string | null; devMock: boolean } {
  if (config.AI_PROVIDER === "mock") return { provider: "mock", configured: true, model: "dev-mock", devMock: true };
  if (config.AI_PROVIDER === "anthropic" && config.ANTHROPIC_API_KEY)
    return { provider: "anthropic", configured: true, model: config.ANTHROPIC_MODEL, devMock: false };
  return { provider: config.AI_PROVIDER, configured: false, model: null, devMock: false };
}
