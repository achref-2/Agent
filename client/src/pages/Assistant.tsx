import { Bot, ChevronDown, CircleAlert, CircleCheck, Clock, MessageSquarePlus, Send, Trash2, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useToast } from "../components/toast";
import { Button, cx, EmptyState, ErrorBox, IconButton, Markdown, Notice, Textarea } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/hooks";
import type { ChatMessage, Conversation, ToolActivity } from "../lib/types";

const QUICK_ACTIONS = [
  "Plan my day. Use my saved tasks and calendar.",
  "What are my most urgent tasks?",
  "What deadlines do I have next week?",
  "Which job applications need a follow-up?",
  "Remind me to email my professor tomorrow at 10.",
];

const TOOL_LABELS: Record<string, string> = {
  create_task: "Created task",
  list_tasks: "Looked up tasks",
  update_task: "Updated task",
  complete_task: "Completed task",
  delete_task: "Delete task",
  list_events: "Read calendar",
  create_event: "Added event",
  get_day_overview: "Read day overview",
  search_applications: "Searched applications",
  create_application: "Added application",
  update_application: "Updated application",
  delete_application: "Delete application",
  search_documents: "Searched documents",
  retrieve_document_passages: "Read document passages",
  save_memory: "Saved memory",
  retrieve_memory: "Read memories",
};

function PendingAction({ activity }: { activity: ToolActivity }) {
  const [state, setState] = useState<"pending" | "confirmed" | "rejected" | "failed">("pending");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function resolve(approve: boolean) {
    setBusy(true);
    try {
      const res = await api.post<{ status: "confirmed" | "rejected" | "failed"; result?: { ok: boolean; summary?: string; error?: string } }>(`/assistant/actions/${activity.pendingActionId}`, { approve });
      setState(res.status);
      setMessage(res.result ? (res.result.ok ? res.result.summary ?? "Done" : res.result.error ?? "Failed") : approve ? "Done" : "Cancelled. Nothing was changed.");
    } catch (err) {
      setMessage(errorMessage(err));
      setState("failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
      <div className="font-medium text-warning">{activity.summary.replace("Awaiting confirmation: ", "")}?</div>
      {state === "pending" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="danger" loading={busy} onClick={() => resolve(true)}>Confirm</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => resolve(false)}>Cancel</Button>
        </div>
      ) : (
        <div className={cx("mt-1 text-xs", state === "failed" ? "text-danger" : "text-muted")}>{message}</div>
      )}
    </div>
  );
}

function ToolActivityList({ items }: { items: ToolActivity[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const failed = items.filter((t) => !t.ok).length;
  return (
    <div className="mb-2">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-muted hover:text-text">
        <Wrench className="size-3" />
        {items.length} tool call{items.length > 1 ? "s" : ""}
        {failed > 0 && <span className="text-danger">· {failed} failed</span>}
        <ChevronDown className={cx("size-3 transition", open && "rotate-180")} />
      </button>
      <ul className={cx("mt-1.5 space-y-1", !open && "hidden")}>
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md bg-surface-2 px-2 py-1.5 text-xs">
            {t.pendingActionId ? <Clock className="mt-0.5 size-3.5 shrink-0 text-warning" /> : t.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-danger" />}
            <div className="min-w-0">
              <span className="font-medium">{TOOL_LABELS[t.name] ?? t.name}</span>
              <span className="text-muted"> · {t.summary}</span>
              <code className="mt-0.5 block truncate text-[11px] text-muted">{t.name}({JSON.stringify(t.input)})</code>
            </div>
          </li>
        ))}
      </ul>
      {/* Visible chips for the most important outcome even when collapsed */}
      {!open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {items.filter((t) => !["list_tasks", "list_events", "get_day_overview", "search_applications", "search_documents", "retrieve_document_passages", "retrieve_memory"].includes(t.name) || !t.ok).map((t, i) => (
            <span key={i} className={cx("rounded-md px-1.5 py-0.5 text-[11px]", t.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{t.summary}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-text">{m.content}</div>
      </div>
    );
  }
  const pending = (m.toolActivity ?? []).filter((t) => t.pendingActionId);
  return (
    <div className="flex gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Bot className="size-4" /></div>
      <div className="min-w-0 max-w-[90%] flex-1">
        <ToolActivityList items={m.toolActivity ?? []} />
        <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-3.5 py-2.5"><Markdown>{m.content}</Markdown></div>
        {pending.map((p) => <PendingAction key={p.pendingActionId} activity={p} />)}
      </div>
    </div>
  );
}

export function AssistantPage() {
  const { ai } = useAuth();
  const toast = useToast();
  const list = useApi<{ conversations: Conversation[] }>("/assistant/conversations");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function open(id: string) {
    setShowList(false);
    setError(null);
    try {
      const res = await api.get<{ conversation: Conversation }>(`/assistant/conversations/${id}`);
      setActiveId(id);
      setMessages(res.conversation.messages);
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/assistant/conversations/${id}`);
      if (id === activeId) newChat();
      void list.reload();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setShowList(false);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: message }]);
    setSending(true);
    try {
      const res = await api.post<{ conversationId: string; reply: string; toolActivity: ToolActivity[] }>("/assistant/chat", { message, conversationId: activeId ?? undefined });
      setMessages((m) => [...m, { role: "assistant", content: res.reply, toolActivity: res.toolActivity }]);
      if (!activeId) {
        setActiveId(res.conversationId);
        void list.reload();
      }
    } catch (err) {
      setError(errorMessage(err));
      setMessages((m) => m.slice(0, -1));
      setInput(message);
    } finally {
      setSending(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const conversations = list.data?.conversations ?? [];
  return (
    <div className="-my-2 flex h-[calc(100dvh-8rem)] gap-4 lg:h-[calc(100dvh-9rem)]">
      <aside className={cx("w-64 shrink-0 flex-col rounded-xl border border-border bg-surface md:flex", showList ? "fixed inset-x-4 top-20 bottom-4 z-30 flex shadow-2xl" : "hidden")}>
        <div className="border-b border-border p-3">
          <Button className="w-full" icon={<MessageSquarePlus className="size-4" />} onClick={newChat}>New chat</Button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {conversations.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted">No conversations yet.</li>}
          {conversations.map((c) => (
            <li key={c.id} className={cx("group flex items-center rounded-lg", c.id === activeId ? "bg-accent-soft" : "hover:bg-surface-2")}>
              <button onClick={() => void open(c.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm">{c.title}</button>
              <IconButton label={`Delete conversation "${c.title}"`} className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => void remove(c.id)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 md:hidden">
          <Button size="sm" variant="outline" onClick={() => setShowList((s) => !s)}>{showList ? "Close" : "Conversations"}</Button>
          <Button size="sm" variant="ghost" onClick={newChat}>New chat</Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!ai?.configured && <Notice>AI is not configured. Add ANTHROPIC_API_KEY to the server's .env file and restart to chat with GhostMate.</Notice>}
          {messages.length === 0 && (
            <EmptyState
              icon={<Bot className="size-8 text-accent" />}
              title="What can I do for you?"
              hint="I can read and change your tasks, calendar, applications and memories, and search your uploaded documents. Every action I take is listed with the answer."
            />
          )}
          {messages.map((m, i) => <Message key={m._id ?? i} m={m} />)}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-accent"><Bot className="size-4 animate-pulse" /></span>
              Working on it…
            </div>
          )}
          {error && <ErrorBox message={error} />}
          <div ref={bottom} />
        </div>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_ACTIONS.map((q) => (
              <button key={q} disabled={sending} onClick={() => void send(q)} className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted hover:border-accent hover:text-text disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <label htmlFor="chat-input" className="sr-only">Message GhostMate</label>
            <Textarea id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={4000} placeholder="Ask GhostMate… (Enter to send, Shift+Enter for a new line)" className="max-h-40 min-h-11 resize-none" />
            <Button type="submit" loading={sending} disabled={!input.trim()} aria-label="Send" className="h-11" icon={<Send className="size-4" />} />
          </form>
        </div>
      </section>
    </div>
  );
}
