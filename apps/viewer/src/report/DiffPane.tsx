import { PatchDiff } from "@pierre/diffs/react";

/**
 * Client-only wrapper around @pierre/diffs. Loaded lazily (see ReportView) so Shiki and
 * its worker code never run during the prerendered shell build.
 */
export default function DiffPane({ patch }: { patch: string }) {
  return <PatchDiff patch={patch} disableWorkerPool />;
}
