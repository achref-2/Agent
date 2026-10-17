export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = { "X-GhostMate": "1" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Cannot reach the GhostMate server. Is it running?", "network");
  }
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const err = data?.error;
    const details: { path: string; message: string }[] | undefined = err?.details;
    const detailText = details?.length ? `: ${details.map((d) => `${d.path || "input"} ${d.message}`).join("; ")}` : "";
    const apiError = new ApiError(res.status, (err?.message ?? `Request failed (${res.status})`) + detailText, err?.code ?? "error", details);
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new CustomEvent("gm:unauthorized"));
    throw apiError;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: Body) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
