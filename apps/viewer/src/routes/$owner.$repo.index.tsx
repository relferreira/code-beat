import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "../components/Dashboard";

// /$owner/$repo — dashboard with the latest open PR selected.
export const Route = createFileRoute("/$owner/$repo/")({
  component: RepoRoute,
});

function RepoRoute() {
  const { owner, repo } = Route.useParams();
  return <Dashboard owner={owner} repo={repo} />;
}
