import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { ReportContainer } from "../components/ReportContainer";

// /$owner/$repo — the repo's latest open PR report.
export const Route = createFileRoute("/$owner/$repo/")({
  component: RepoRoute,
});

function RepoRoute() {
  const { owner, repo } = Route.useParams();
  return (
    <AppShell active={{ owner, repo }} loginSubtitle={`Sign in to view ${owner}/${repo}.`}>
      <ReportContainer owner={owner} repo={repo} />
    </AppShell>
  );
}
