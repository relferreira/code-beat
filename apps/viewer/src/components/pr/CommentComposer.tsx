import { useState, type FormEvent } from "react";

/** Markdown-friendly text area + submit for conversation comments and review bodies. */
export function CommentComposer({
  placeholder = "Leave a comment",
  submitLabel = "Comment",
  disabled,
  busy,
  error,
  minRows = 3,
  onSubmit,
}: {
  placeholder?: string;
  submitLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  minRows?: number;
  onSubmit: (body: string) => Promise<void> | void;
}) {
  const [body, setBody] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) {
      setLocalError("Write something first.");
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      await onSubmit(text);
      setBody("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isBusy = busy || submitting;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={minRows}
        disabled={disabled || isBusy}
        className="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus:border-brand focus:outline-none disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-fg-3">Markdown supported</p>
        <div className="flex items-center gap-2">
          {(error || localError) && (
            <span className="max-w-xs truncate text-xs text-sev-blocker" title={error || localError || ""}>
              {error || localError}
            </span>
          )}
          <button
            type="submit"
            disabled={disabled || isBusy || !body.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {isBusy ? "Posting…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
