export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "bad_request", details);
export const unauthorized = (msg = "Not signed in") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg, "forbidden");
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`, "not_found");
export const aiUnavailable = () =>
  new HttpError(
    503,
    "AI is not configured. Set ANTHROPIC_API_KEY in .env (or AI_PROVIDER=mock for development) and restart the server.",
    "ai_not_configured",
  );
