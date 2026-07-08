import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { ReportContainer } from "../components/ReportContainer";

export const Route = createFileRoute("/$owner/$repo/pull/$number")({
  component: PullRoute,
});

function PullRoute() {
  const { owner, repo, number } = Route.useParams();
  const pullNumber = Number(number);
  return (
    <AppShell active={{ owner, repo, number: pullNumber }} loginSubtitle={`Sign in to view ${owner}/${repo}.`}>
      <ReportContainer owner={owner} repo={repo} number={pullNumber} />
    </AppShell>
  );
}
