import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { GithubIcon } from "../components/icons";
import { useAuth } from "../lib/auth-client";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  function openRepo(event: React.FormEvent) {
    event.preventDefault();
    const parts = value
      .trim()
      .replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length >= 2) {
      navigate({ to: "/$owner/$repo", params: { owner: parts[0], repo: parts[1] } });
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader user={auth.signedIn ? auth.session?.user : undefined} onSignOut={auth.signOut} />

      <main className="mx-auto max-w-2xl px-6 pt-24 pb-24 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-3xl shadow-sm">🥁</div>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight text-fg text-balance sm:text-[2.5rem] sm:leading-[1.1]">
          AI code reviews, beautifully readable.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-fg-2">
          Code Beat reviews your pull requests and scores them. This is where you read the report and the diff —
          private, fast, and yours.
        </p>

        {auth.ready && auth.signedIn ? (
          <form onSubmit={openRepo} className="mx-auto mt-9 flex max-w-md items-center gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="owner/repo"
              aria-label="Repository"
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-3 focus:border-fg-3 focus:outline-none"
            />
            <button className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-hover">
              Open
            </button>
          </form>
        ) : (
          <button
            onClick={auth.signIn}
            className="mt-9 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            <GithubIcon />
            Sign in with GitHub
          </button>
        )}

        <p className="mt-6 text-xs text-fg-3">Reads repo content with your GitHub access. Nothing is stored.</p>
      </main>
    </div>
  );
}
