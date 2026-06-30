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
export const Route = createFileRoute("/legal/gdpr")({
  head: () => ({ meta: [{ title: "GDPR Data Requests — Shootbase" }], links: [{ rel: "canonical", href: "/legal/gdpr" }] }),
  component: make("GDPR Data Requests", "To request an export of your personal data, correction, or account deletion, email privacy@captureconnect.example. We aim to respond within 30 days."),
});
