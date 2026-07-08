import { FileCard } from "../report/FileCard";
import type { PullDetail, ViewerFile } from "../report/types";

/**
 * Pull request tab: the description plus every changed file's diff — the GitHub view.
 *
 * The body is rendered as preformatted text rather than parsed markdown: it keeps the
 * dependency surface (and XSS surface) at zero. Markdown rendering is a later call.
 */
export function PullFiles({ pull, files }: { pull: PullDetail; files: ViewerFile[] }) {
  const body = pull.body.trim();

  return (
    <div>
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-3">Description</div>
        {body ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{body}</p>
        ) : (
          <p className="text-sm text-fg-3">No description provided.</p>
        )}
      </section>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg">
          {files.length} changed {files.length === 1 ? "file" : "files"}
        </h2>
        <span className="text-xs text-fg-3">
          <span className="text-good">+{pull.additions}</span>{" "}
          <span className="text-sev-blocker">&minus;{pull.deletions}</span>
        </span>
      </div>

      <div className="mt-3 space-y-6">
        {files.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-fg-3">
            No changed files.
          </div>
        ) : (
          files.map((file) => <FileCard key={file.path} file={file} />)
        )}
      </div>
    </div>
  );
}
