import { useEffect, useId, useState } from "react";

/**
 * Client-only Mermaid renderer. Lazy-loads mermaid so the SPA shell build stays light
 * and SSR/prerender never executes diagram layout.
 */
export function MermaidDiagram({ source, title }: { source: string; title?: string }) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark ? "dark" : "neutral",
          fontFamily: "inherit",
        });
        const { svg: rendered } = await mermaid.render(`mermaid-${reactId}`, source);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render diagram");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, reactId]);

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs text-fg-3">Diagram failed to render{title ? ` (${title})` : ""}.</p>
        <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-fg-2">{source}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border text-xs text-fg-3">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-4 [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
