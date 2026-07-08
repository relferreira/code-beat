import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * GitHub-flavoured markdown for PR descriptions, review comments, and report prose.
 *
 * react-markdown renders to React elements and does NOT render raw HTML unless rehype-raw is
 * added — so there's no dangerouslySetInnerHTML and no sanitizer to get wrong.
 */
const components: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-fg-3 line-through">{children}</del>,

  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  h1: ({ children }) => <h3 className="mt-3 mb-1 text-[15px] font-semibold text-fg first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1 text-sm font-semibold text-fg first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-fg first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-2 mb-1 text-[13px] font-semibold text-fg first:mt-0">{children}</h5>,

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-fg-3">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,

  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs">{children}</pre>
  ),
  code: ({ className, children }) => {
    // Fenced blocks arrive with a `language-*` class; everything else is inline.
    const isBlock = typeof className === "string" && className.includes("language-");
    return isBlock ? (
      <code className="font-mono text-xs">{children}</code>
    ) : (
      <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em] text-fg">{children}</code>
    );
  },

  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 font-medium text-fg">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-2 py-1">{children}</td>,

  img: ({ src, alt }) => (
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-2 max-w-full rounded-lg" />
  ),
  // remark-gfm emits disabled checkboxes for task lists.
  input: ({ type, checked }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={Boolean(checked)} readOnly className="mr-1.5 align-middle" />
    ) : null,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
