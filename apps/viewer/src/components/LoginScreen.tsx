import { useAuth } from "../lib/auth-client";
import { GithubIcon } from "./icons";

export function LoginScreen({ title, subtitle }: { title?: string; subtitle?: string }) {
  const auth = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-brand text-2xl shadow-sm">🥁</div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-fg">{title ?? "Sign in to Code Beat"}</h1>
        <p className="mt-1.5 text-sm text-fg-2">
          {subtitle ?? "View AI code reviews for your pull requests."}
        </p>
        <button
          onClick={auth.signIn}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          <GithubIcon />
          Sign in with GitHub
        </button>
        <p className="mt-4 text-xs text-fg-3">Repo content is read with your GitHub access — nothing is stored.</p>
      </div>
    </div>
  );
}
