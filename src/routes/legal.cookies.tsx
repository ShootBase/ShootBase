import { createFileRoute } from "@tanstack/react-router";
function make(title: string, body: string) {
  return function Page() {
    return (
      <article className="prose max-w-none">
        <h1 className="font-display text-4xl mb-6">{title}</h1>
        <p className="text-sm text-ink/70 leading-relaxed whitespace-pre-line">{body}</p>
      </article>
    );
  };
}
export const Route = createFileRoute("/legal/cookies")({
  head: () => ({ meta: [{ title: "Cookie Policy — Shootbase" }], links: [{ rel: "canonical", href: "/legal/cookies" }] }),
  component: make("Cookie Policy", "Placeholder cookie policy covering strictly-necessary, preference, analytics and marketing cookies."),
});
