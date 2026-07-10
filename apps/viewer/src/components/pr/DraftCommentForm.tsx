import { useState } from "react";

/** Small form to stage an inline review comment on a file/line for the pending review. */
export function DraftCommentForm({
  path,
  defaultLine = 1,
  onAdd,
}: {
  path: string;
  defaultLine?: number;
  onAdd: (args: { path: string; line: number; side: "LEFT" | "RIGHT"; body: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState(defaultLine);
  const [side, setSide] = useState<"LEFT" | "RIGHT">("RIGHT");
  const [body, setBody] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand hover:underline"
      >
        + Add review comment
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1 text-fg-2">
          Line
          <input
            type="number"
            min={1}
            value={line}
            onChange={(e) => setLine(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-fg"
          />
        </label>
        <label className="flex items-center gap-1 text-fg-2">
          Side
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "LEFT" | "RIGHT")}
            className="rounded border border-border bg-bg px-1.5 py-0.5 text-fg"
          >
            <option value="RIGHT">New (RIGHT)</option>
            <option value="LEFT">Old (LEFT)</option>
          </select>
        </label>
        <span className="font-mono text-fg-3">{path}</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Leave a comment"
        className="mt-2 w-full resize-y rounded border border-border bg-bg px-2 py-1.5 text-sm text-fg focus:border-brand focus:outline-none"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!body.trim()}
          onClick={() => {
            onAdd({ path, line, side, body: body.trim() });
            setBody("");
            setOpen(false);
          }}
          className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Add to review
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1 text-xs text-fg-3 hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
