import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "../components/Dashboard";

export const Route = createFileRoute("/$owner/$repo/pull/$number")({
  component: PullRoute,
});

function PullRoute() {
  const { owner, repo, number } = Route.useParams();
  return <Dashboard owner={owner} repo={repo} number={Number(number)} />;
}
