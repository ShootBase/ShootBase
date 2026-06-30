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
export const Route = createFileRoute("/legal/photographer-terms")({
  head: () => ({ meta: [{ title: "Professional Terms — Shootbase" }], links: [{ rel: "canonical", href: "/legal/photographer-terms" }] }),
  component: make("Professional Terms", "Placeholder terms applicable to photographers and videographers listed on Shootbase."),
});
