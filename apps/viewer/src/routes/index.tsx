import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="container">
      <header className="masthead">
        <h1>🥁 Code Beat</h1>
        <p className="tagline">Report viewer</p>
      </header>
      <section className="card">
        <p>
          This is the client-rendered viewer for Code Beat review reports. In production the
          review action writes a <code>report.json</code> into your repository and links here;
          the viewer fetches the report and diff in your browser, using your own GitHub session.
        </p>
        <p>
          No report data passes through a Code Beat server. This page currently renders a demo
          fixture so you can see the UI before auth is wired.
        </p>
        <p>
          <Link className="button" to="/$owner/$repo/pull/$number" params={{ owner: "relferreira", repo: "code-beat", number: "42" }}>
            View demo report →
          </Link>
        </p>
      </section>
    </main>
  );
}
