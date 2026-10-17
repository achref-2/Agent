import {
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  CalendarDays,
  FileText,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/dates";
import { useTheme } from "../lib/theme";
import type { Notification } from "../lib/types";
import { useToast } from "./toast";
import { cx, IconButton, Spinner } from "./ui";

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
  { to: "/tasks", label: "Tasks & Calendar", icon: CalendarDays },
  { to: "/study", label: "Study Workspace", icon: BookOpen },
  { to: "/german", label: "German Coach", icon: Languages },
  { to: "/jobs", label: "Job Applications", icon: Briefcase },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/settings", label: "Memory & Settings", icon: Settings },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, ai, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img src="/ghost.svg" alt="" className="size-8" />
        <span className="text-lg font-semibold tracking-tight text-accent">GhostMate</span>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive ? "bg-accent text-accent-text shadow-sm" : "text-muted hover:bg-surface-2 hover:text-text",
              )
            }
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-border p-3">
        <div className="px-1 text-xs">
          <div className="mb-1 font-semibold uppercase tracking-wider text-muted">AI model</div>
          {ai?.devMock ? (
            <span className="text-warning">Development mock (not real AI)</span>
          ) : ai?.configured ? (
            <span className="text-success">{ai.model}</span>
          ) : (
            <span className="text-danger">Not configured</span>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-text">{user?.name?.[0]?.toUpperCase()}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user?.name}</div>
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
          </div>
          <button onClick={() => void logout()} className="mt-2.5 flex items-center gap-2 text-sm text-muted hover:text-text">
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ notifications: Notification[] }>("/notifications");
      setItems(res.notifications);
      for (const n of res.notifications) {
        if (!n.readAt && !seen.current.has(n.id) && !first.current) {
          toast("info", n.title);
          if ("Notification" in window && window.Notification.permission === "granted") new window.Notification(n.title, { body: n.body, icon: "/ghost.svg" });
        }
        seen.current.add(n.id);
      }
      first.current = false;
    } catch {
      /* transient: the next poll retries */
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="relative">
      <IconButton label={`Notifications${unread ? ` (${unread} unread)` : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bell className="size-4.5" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" />}
      </IconButton>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Reminders</span>
            {unread > 0 && (
              <button
                className="text-xs text-accent hover:underline"
                onClick={async () => {
                  await api.post("/notifications/read-all");
                  void load();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No reminders yet.</li>}
            {items.map((n) => (
              <li key={n.id} className={cx("border-b border-border px-3 py-2 last:border-0", !n.readAt && "bg-accent-soft/40")}>
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted">
                  {n.body && `${n.body} · `}
                  {formatDateTime(n.createdAt)}
                </div>
              </li>
            ))}
          </ul>
          {"Notification" in window && window.Notification.permission === "default" && (
            <button className="w-full border-t border-border px-3 py-2 text-left text-xs text-accent hover:underline" onClick={() => void window.Notification.requestPermission()}>
              Also show browser notifications (only while GhostMate is open)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const { theme, toggle } = useTheme();
  const { ai } = useAuth();
  const location = useLocation();
  const current = NAV.find((n) => (n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)));

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-surface shadow-2xl">
            <IconButton label="Close menu" className="absolute right-2 top-3" onClick={() => setDrawer(false)}>
              <X className="size-4" />
            </IconButton>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur sm:px-5">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setDrawer(true)}>
            <Menu className="size-5" />
          </IconButton>
          <span className="font-semibold text-accent">{current?.label}</span>
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
            </IconButton>
          </div>
        </header>
        {ai?.devMock && (
          <div className="border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">
            Development mode: AI answers are placeholders from a mock, not real model output. Set ANTHROPIC_API_KEY and AI_PROVIDER=anthropic for real AI.
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:py-7">
            <Suspense fallback={<div className="flex justify-center py-16"><Spinner label="Loading page" /></div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
