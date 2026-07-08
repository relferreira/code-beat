import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "../components/AppHeader";
import { AppShell } from "../components/AppShell";
import { Feed } from "../components/Feed";
import { GithubIcon } from "../components/icons";
import { useAuth } from "../lib/auth-client";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const auth = useAuth();

  if (!auth.ready) {
    return <div className="grid min-h-dvh place-items-center bg-bg text-sm text-fg-3">Loading…</div>;
  }
  if (!auth.signedIn) {
    return <Landing onSignIn={auth.signIn} />;
  }

  return (
    <AppShell>
      <Feed />
    </AppShell>
  );
}

function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 pt-24 pb-24 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-3xl shadow-sm">🥁</div>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-[2.5rem] sm:leading-[1.1]">
          AI code reviews, beautifully readable.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-fg-2">
          Code Beat reviews your pull requests and scores them. This is where you read the report and the diff —
          private, fast, and yours.
        </p>
        <button
          onClick={onSignIn}
          className="mt-9 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          <GithubIcon />
          Sign in with GitHub
        </button>
        <p className="mt-6 text-xs text-fg-3">Reads repo content with your GitHub access. Nothing is stored.</p>
      </main>
    </div>
  );
}
