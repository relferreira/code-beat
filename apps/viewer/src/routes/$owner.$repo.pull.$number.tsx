import { createFileRoute } from "@tanstack/react-router";
import { ReportView } from "../report/ReportView";
import { demoFiles, demoReport } from "../report/fixture";

export const Route = createFileRoute("/$owner/$repo/pull/$number")({
  component: ReportRoutePage,
});

function ReportRoutePage() {
  const { owner, repo, number } = Route.useParams();

  // Step 2: render the demo fixture regardless of params. Step 3 replaces this with a
  // client-side fetch of report.json (contents API) + the diff (pulls/files) using the
  // reviewer's own GitHub session.
  return <ReportView report={demoReport} files={demoFiles} params={{ owner, repo, number }} />;
}
