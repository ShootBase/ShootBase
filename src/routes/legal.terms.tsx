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
export const Route = createFileRoute("/legal/terms")({
  head: () => ({ meta: [{ title: "Terms & Conditions — Shootbase" }], links: [{ rel: "canonical", href: "/legal/terms" }] }),
  component: make("Terms & Conditions", "Placeholder marketplace terms governing use of Shootbase by customers and professionals."),
});
