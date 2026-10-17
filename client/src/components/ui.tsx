import { AlertTriangle, Check, Copy, Inbox, Loader2, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-text hover:brightness-110 border border-transparent",
  secondary: "bg-surface-2 text-text hover:bg-surface-3 border border-border",
  outline: "bg-transparent text-text hover:bg-surface-2 border border-border",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-surface-2 border border-transparent",
  danger: "bg-danger-soft text-danger hover:brightness-110 border border-transparent",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
          size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
          variants[variant],
          className,
        )}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text transition", className)} {...rest}>
      {children}
    </button>
  );
}

const fieldBase = "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, "py-2 min-h-24", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

/** Label + control + optional hint. The child receives the generated id. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("rounded-xl border border-border bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {action}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "accent" | "cyan" | "purple" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  accent: "bg-accent-soft text-accent",
  cyan: "bg-cyan-soft text-cyan",
  purple: "bg-purple-soft text-purple",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide", tones[tone], className)}>{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "warning", children }: { tone?: "warning" | "accent" | "success"; children: ReactNode }) {
  const t = { warning: "border-warning/30 bg-warning-soft text-warning", accent: "border-accent/30 bg-accent-soft text-accent", success: "border-success/30 bg-success-soft text-success" }[tone];
  return <div className={cx("rounded-lg border px-3 py-2.5 text-sm", t)}>{children}</div>;
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <div className="text-muted">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="text-sm font-medium text-text">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx("flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose} data-close>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className, label }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cx("flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
            value === t.id ? "bg-accent text-accent-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-gm text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      icon={done ? <Check className="size-4" /> : <Copy className="size-4" />}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
