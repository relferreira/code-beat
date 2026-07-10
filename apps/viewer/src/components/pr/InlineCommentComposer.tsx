import { useEffect, useRef, useState, type FormEvent } from "react";

/** Comment box that sits in a diff line annotation (GitHub-style inline review). */
export function InlineCommentComposer({
  path,
  line,
  side,
  onSubmit,
  onCancel,
}: {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [path, line, side]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    onSubmit(text);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-y border-border bg-surface px-4 py-3"
      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <span className="font-medium text-fg-2">Add a review comment</span>
        <span className="font-mono">
          {path}:{line}
        </span>
        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {side === "RIGHT" ? "new" : "old"}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Leave a comment"
        className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-3 focus:border-brand focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            const text = body.trim();
            if (text) onSubmit(text);
          }
        }}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-fg-3">⌘/Ctrl+Enter to add · Esc to cancel</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2.5 py-1 text-xs text-fg-3 transition hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!body.trim()}
            className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            Add review comment
          </button>
        </div>
      </div>
    </form>
  );
}
