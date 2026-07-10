import { useMemo, useState } from "react";
import type { PullDetail } from "../../report/types";
import type { MergeMethod } from "../../lib/pr-actions";

/** Merge / squash / rebase controls, modeled after GitHub’s merge box. */
export function MergeBox({
  pull,
  disabled,
  onMerge,
}: {
  pull: PullDetail;
  disabled?: boolean;
  onMerge: (args: {
    mergeMethod: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  }) => Promise<void>;
}) {
  const methods = useMemo(() => {
    const list: Array<{ id: MergeMethod; label: string }> = [];
    if (pull.allowMergeCommit) list.push({ id: "merge", label: "Create a merge commit" });
    if (pull.allowSquashMerge) list.push({ id: "squash", label: "Squash and merge" });
    if (pull.allowRebaseMerge) list.push({ id: "rebase", label: "Rebase and merge" });
    if (list.length === 0) {
      list.push(
        { id: "merge", label: "Create a merge commit" },
        { id: "squash", label: "Squash and merge" },
        { id: "rebase", label: "Rebase and merge" },
      );
    }
    return list;
  }, [pull.allowMergeCommit, pull.allowSquashMerge, pull.allowRebaseMerge]);

  const [method, setMethod] = useState<MergeMethod>(methods[0]?.id ?? "merge");
  const [title, setTitle] = useState(pull.title);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (pull.merged || done) {
    return (
      <section className="rounded-2xl border border-good/30 bg-good/10 p-4">
        <h3 className="text-sm font-semibold text-good">Merged</h3>
        <p className="mt-1 text-xs text-fg-2">This pull request has been merged.</p>
      </section>
    );
  }

  if (pull.state === "closed") {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">Closed</h3>
        <p className="mt-1 text-xs text-fg-3">This pull request is closed and cannot be merged.</p>
      </section>
    );
  }

  if (pull.draft) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">Draft</h3>
        <p className="mt-1 text-xs text-fg-3">Mark the PR ready for review on GitHub before merging.</p>
      </section>
    );
  }

  const blocked =
    pull.mergeable === false ||
    pull.mergeableState === "dirty" ||
    pull.mergeableState === "blocked" ||
    pull.mergeableState === "draft";

  async function handleMerge() {
    setError(null);
    setBusy(true);
    try {
      await onMerge({
        mergeMethod: method,
        commitTitle: method === "rebase" ? undefined : title.trim() || undefined,
        commitMessage: method === "rebase" ? undefined : message.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Merge pull request</h3>
      <p className="mt-0.5 text-xs text-fg-3">
        {pull.mergeable === null
          ? "Checking whether this can be merged…"
          : blocked
            ? `Not mergeable yet (${pull.mergeableState}).`
            : `Ready to merge into ${pull.baseRef}.`}
      </p>

      <label className="mt-3 block text-xs font-medium text-fg-2">
        Merge method
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as MergeMethod)}
          disabled={disabled || busy}
          className="mt-1 w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg focus:border-brand focus:outline-none"
        >
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {method !== "rebase" ? (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={disabled || busy}
            placeholder="Commit title"
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg focus:border-brand focus:outline-none"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={disabled || busy}
            placeholder="Extended description (optional)"
            rows={2}
            className="w-full resize-y rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg focus:border-brand focus:outline-none"
          />
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-sev-blocker">{error}</p> : null}

      <button
        type="button"
        disabled={disabled || busy || blocked || pull.mergeable === null}
        onClick={() => void handleMerge()}
        className="mt-3 rounded-lg bg-good px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Merging…" : methods.find((m) => m.id === method)?.label ?? "Merge"}
      </button>
    </section>
  );
}
