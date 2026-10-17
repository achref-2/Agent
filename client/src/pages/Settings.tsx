import { Brain, Check, Download, KeyRound, Pencil, Plug, Trash2, User as UserIcon, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "../components/toast";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, IconButton, Input, PageHeader, Select, Spinner, Textarea } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/dates";
import { useApi } from "../lib/hooks";
import { useTheme } from "../lib/theme";
import type { Memory, User } from "../lib/types";

const MEMORY_CATEGORIES = [
  ["preference", "Preference"],
  ["communication_style", "Communication style"],
  ["project", "Current project"],
  ["study_goal", "Study goal"],
  ["routine", "Routine"],
  ["other", "Other"],
] as const;

function ProfileCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(() => ({ name: user!.name, timezone: user!.timezone, ...user!.profile, skills: user!.profile.skills.join(", "), goals: user!.german.goals }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.patch<{ user: User }>("/settings", {
        name: form.name,
        timezone: form.timezone,
        profile: { headline: form.headline, background: form.background, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean), languages: form.languages, location: form.location },
        german: { goals: form.goals },
      });
      setUser(res.user);
      toast("success", "Profile saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card title={<span className="inline-flex items-center gap-2"><UserIcon className="size-4" /> Profile</span>}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">{(id) => <Input id={id} required value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
          <Field label="Timezone" hint="Used for 'today', due dates and reminders.">{(id) => <Input id={id} value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />}</Field>
        </div>
        <h3 className="pt-2 text-sm font-semibold">Career profile</h3>
        <p className="text-xs text-muted">Job matching and cover letters use only what you write here. GhostMate never adds experience you don't have.</p>
        <Field label="Headline">{(id) => <Input id={id} value={form.headline} onChange={(e) => set("headline", e.target.value)} placeholder="M.Sc. Informatik student at TH Köln, full-stack developer" />}</Field>
        <Field label="Background and experience">{(id) => <Textarea id={id} rows={5} value={form.background} onChange={(e) => set("background", e.target.value)} placeholder="Education, projects, previous jobs, what you built…" />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Skills (comma separated)">{(id) => <Input id={id} value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="React, Node.js, MongoDB, Python" />}</Field>
          <Field label="Languages">{(id) => <Input id={id} value={form.languages} onChange={(e) => set("languages", e.target.value)} placeholder="Arabic (native), French (C1), English (C1), German (B1)" />}</Field>
          <Field label="Location">{(id) => <Input id={id} value={form.location} onChange={(e) => set("location", e.target.value)} />}</Field>
          <Field label="German learning goals">{(id) => <Input id={id} value={form.goals} onChange={(e) => set("goals", e.target.value)} placeholder="Pass telc B2, handle job interviews in German" />}</Field>
        </div>
        {error && <ErrorBox message={error} />}
        <Button type="submit" loading={pending}>Save profile</Button>
      </form>
    </Card>
  );
}

function MemoryRow({ m, onChanged }: { m: Memory; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(m.content);
  const [category, setCategory] = useState(m.category);
  async function save() {
    try {
      await api.patch(`/memory/${m.id}`, { content, category });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  async function remove() {
    try {
      await api.delete(`/memory/${m.id}`);
      onChanged();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  return (
    <li className="rounded-lg border border-border p-2.5">
      {editing ? (
        <div className="space-y-2">
          <Textarea aria-label="Memory content" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-16" />
          <div className="flex gap-2">
            <Select aria-label="Category" className="h-8 w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>{MEMORY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <IconButton label="Save memory" onClick={save}><Check className="size-4" /></IconButton>
            <IconButton label="Cancel editing" onClick={() => { setEditing(false); setContent(m.content); }}><X className="size-4" /></IconButton>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm">{m.content}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge>{MEMORY_CATEGORIES.find(([v]) => v === m.category)?.[1] ?? m.category}</Badge>
              <span>{m.source === "assistant" ? "Saved by GhostMate" : "Added by you"} · {formatDateTime(m.updatedAt)}</span>
            </div>
          </div>
          <IconButton label="Edit memory" onClick={() => setEditing(true)}><Pencil className="size-4" /></IconButton>
          <IconButton label="Delete memory" onClick={remove}><Trash2 className="size-4" /></IconButton>
        </div>
      )}
    </li>
  );
}

function MemoryCard() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ memories: Memory[] }>("/memory");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("preference");
  const [confirmClear, setConfirmClear] = useState(false);

  async function toggle(enabled: boolean) {
    try {
      const res = await api.patch<{ user: User }>("/settings", { memoryEnabled: enabled });
      setUser(res.user);
      toast("success", enabled ? "Memory turned on" : "Memory turned off. GhostMate will not read or save memories.");
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/memory", { content, category });
      setContent("");
      void reload();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  async function clearAll() {
    try {
      const res = await api.delete<{ deleted: number }>("/memory");
      toast("success", `Deleted ${res.deleted} memories`);
      setConfirmClear(false);
      void reload();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Brain className="size-4" /> Memory</span>}>
      <div className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg bg-surface-2 p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={user?.memoryEnabled ?? true} onChange={(e) => void toggle(e.target.checked)} />
          <span>
            <span className="font-medium">Let GhostMate use long-term memory</span>
            <span className="block text-xs text-muted">Preferences, goals and routines you want remembered across chats. Tasks, deadlines and applications are always stored separately as records and are not affected.</span>
          </span>
        </label>
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label="New memory" required minLength={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="e.g. I prefer short answers with bullet points" />
          <Select aria-label="Category" className="sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)}>{MEMORY_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Button type="submit">Add</Button>
        </form>
        {loading && !data ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.memories.length ? (
          <EmptyState title="No memories saved" hint="Add one above, or tell the assistant “remember that …”." />
        ) : (
          <ul className="space-y-2">{data.memories.map((m) => <MemoryRow key={m.id} m={m} onChanged={reload} />)}</ul>
        )}
        {Boolean(data?.memories.length) && (
          confirmClear ? (
            <div className="flex items-center gap-2 text-sm">Delete all memories? <Button size="sm" variant="danger" onClick={clearAll}>Delete all</Button><Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button></div>
          ) : <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>Delete all memories</Button>
        )}
      </div>
    </Card>
  );
}

function SystemCard() {
  const { ai } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data } = useApi<{ integrations: Record<string, { connected: boolean; note: string }> }>("/settings");
  const labels: Record<string, string> = { calendar: "Calendar sync", email: "Email", jobSearch: "Live job search", pushNotifications: "Push notifications" };
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Plug className="size-4" /> AI, integrations &amp; appearance</span>}>
      <div className="space-y-4 text-sm">
        <div>
          <div className="font-medium">AI model</div>
          <p className="text-muted">
            {ai?.devMock ? "Development mock: answers are placeholders, not real AI." : ai?.configured ? `${ai.provider} · ${ai.model}` : "Not configured. Set ANTHROPIC_API_KEY on the server."}
          </p>
        </div>
        <ul className="space-y-2">
          {data && Object.entries(data.integrations).map(([k, v]) => (
            <li key={k} className="flex items-start justify-between gap-3">
              <span><span className="font-medium">{labels[k] ?? k}</span><span className="block text-xs text-muted">{v.note}</span></span>
              <Badge tone={v.connected ? "success" : "neutral"}>{v.connected ? "connected" : "not connected"}</Badge>
            </li>
          ))}
        </ul>
        <Field label="Theme">{(id) => <Select id={id} value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}><option value="dark">Dark</option><option value="light">Light</option></Select>}</Field>
      </div>
    </Card>
  );
}

function SecurityCard() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  useEffect(() => setError(null), [form]);
  async function change(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/auth/change-password", form);
      setForm({ currentPassword: "", newPassword: "" });
      toast("success", "Password changed");
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function wipeChats() {
    try {
      const res = await api.delete<{ deleted: number }>("/settings/conversations");
      toast("success", `Deleted ${res.deleted} conversations`);
      setConfirmWipe(false);
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }
  return (
    <Card title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4" /> Security &amp; data</span>}>
      <form onSubmit={change} className="space-y-3">
        <Field label="Current password">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />}</Field>
        <Field label="New password" hint="At least 10 characters.">{(id) => <Input id={id} type="password" autoComplete="new-password" minLength={10} required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />}</Field>
        {error && <ErrorBox message={error} />}
        <Button type="submit" variant="secondary">Change password</Button>
      </form>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <a href="/api/settings/export" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2"><Download className="size-4" /> Export my data (JSON)</a>
        {confirmWipe ? (
          <><Button size="sm" variant="danger" onClick={wipeChats}>Delete all chats</Button><Button size="sm" variant="ghost" onClick={() => setConfirmWipe(false)}>Cancel</Button></>
        ) : <Button size="sm" variant="ghost" onClick={() => setConfirmWipe(true)}>Delete chat history</Button>}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Memory & Settings" subtitle="Everything GhostMate knows about you is visible and editable here." />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ProfileCard />
          <SecurityCard />
        </div>
        <div className="space-y-5">
          <MemoryCard />
          <SystemCard />
        </div>
      </div>
    </div>
  );
}
