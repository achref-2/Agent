import { useEffect, useState, type FormEvent } from "react";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../lib/types";

export function LoginPage() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api
      .get<{ registrationOpen: boolean; hasUsers: boolean }>("/auth/status")
      .then((s) => {
        setRegistrationOpen(s.registrationOpen);
        if (!s.hasUsers) setMode("register");
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post<{ user: User }>(mode === "login" ? "/auth/login" : "/auth/register", mode === "login" ? { email: form.email, password: form.password } : form);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/ghost.svg" alt="" className="size-14" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">GhostMate</h1>
            <p className="text-sm text-muted">Your personal agent for uni, German, jobs and life admin.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h2>
          {mode === "register" && (
            <Field label="Name">{(id) => <Input id={id} required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          )}
          <Field label="Email">{(id) => <Input id={id} type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Password" hint={mode === "register" ? "At least 10 characters." : undefined}>
            {(id) => (
              <Input
                id={id}
                type="password"
                required
                minLength={mode === "register" ? 10 : 1}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            )}
          </Field>
          {error && <ErrorBox message={error} />}
          <Button type="submit" className="w-full" loading={pending}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
          {registrationOpen && (
            <p className="text-center text-sm text-muted">
              {mode === "login" ? "No account yet? " : "Already registered? "}
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
