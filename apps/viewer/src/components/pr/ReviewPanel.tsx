import { useState } from "react";
import type { DraftReviewComment } from "../../report/types";
import type { ReviewEvent } from "../../lib/pr-actions";

/** Submit a GitHub review: approve, request changes, or comment — with optional draft inline notes. */
export function ReviewPanel({
  draftComments,
  onRemoveDraft,
  disabled,
  onSubmit,
}: {
  draftComments: DraftReviewComment[];
  onRemoveDraft: (id: string) => void;
  disabled?: boolean;
  onSubmit: (args: { event: ReviewEvent; body: string }) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: ReviewEvent) {
    const text = body.trim();
    if ((event === "REQUEST_CHANGES" || event === "COMMENT") && !text && draftComments.length === 0) {
      setError("Add a summary or inline comments first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // GitHub requires body for REQUEST_CHANGES/COMMENT when there are no comments sometimes;
      // if we only have drafts, invent a short body.
      const finalBody =
        text ||
        (draftComments.length > 0 && event !== "APPROVE"
          ? `Reviewed with ${draftComments.length} inline comment${draftComments.length === 1 ? "" : "s"}.`
          : text);
      await onSubmit({ event, body: finalBody });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Review changes</h3>
      <p className="mt-0.5 text-xs text-fg-3">
        Approve, request changes, or leave a review comment
        {draftComments.length > 0
          ? ` · ${draftComments.length} pending inline comment${draftComments.length === 1 ? "" : "s"}`
          : ""}
        .
      </p>

      {draftComments.length > 0 ? (
        <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
          {draftComments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span className="min-w-0 flex-1 font-mono text-fg-2">
                {c.path}:{c.line}
                <span className="mt-0.5 block truncate font-sans text-fg-3">{c.body}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveDraft(c.id)}
                className="shrink-0 text-fg-3 hover:text-sev-blocker"
                title="Remove draft"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Summary of your review (optional for approve)"
        rows={3}
        disabled={disabled || busy}
        className="mt-3 w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus:border-brand focus:outline-none disabled:opacity-60"
      />

      {error ? <p className="mt-2 text-xs text-sev-blocker">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void submit("COMMENT")}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg-2 transition hover:bg-surface-3 hover:text-fg disabled:opacity-50"
        >
          Comment
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void submit("APPROVE")}
          className="rounded-lg border border-good/30 bg-good/12 px-3 py-1.5 text-sm font-medium text-good transition hover:bg-good/20 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void submit("REQUEST_CHANGES")}
          className="rounded-lg border border-sev-blocker/30 bg-sev-blocker/12 px-3 py-1.5 text-sm font-medium text-sev-blocker transition hover:bg-sev-blocker/20 disabled:opacity-50"
        >
          Request changes
        </button>
      </div>
    </section>
  );
}
