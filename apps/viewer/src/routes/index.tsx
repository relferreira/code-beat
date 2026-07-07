import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [owner, setOwner] = useState("relferreira");
  const [repo, setRepo] = useState("code-beat-test");
  const [number, setNumber] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!owner || !repo || !number) return;
    navigate({ to: "/$owner/$repo/pull/$number", params: { owner, repo, number } });
  }

  return (
    <main className="container">
      <header className="masthead">
        <h1>🥁 Code Beat</h1>
        <p className="tagline">Report viewer</p>
      </header>
      <section className="card">
        <p>
          Client-rendered viewer for Code Beat review reports. The review action writes a{" "}
          <code>report.json</code> into your repository and links here; the viewer fetches the
          report and diff in your browser. No report data passes through a Code Beat server.
        </p>
        <form className="jump" onSubmit={submit}>
          <input aria-label="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner" />
          <span className="sep">/</span>
          <input aria-label="repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="repo" />
          <span className="sep">#</span>
          <input
            aria-label="pull request number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="PR #"
            inputMode="numeric"
          />
          <button className="button" type="submit">
            View report →
          </button>
        </form>
      </section>
    </main>
  );
}
