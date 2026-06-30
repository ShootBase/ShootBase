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
export const Route = createFileRoute("/legal/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Shootbase" }, { name: "description", content: "How Shootbase handles your personal data under UK GDPR." }], links: [{ rel: "canonical", href: "/legal/privacy" }] }),
  component: make(
    "Privacy Policy",
    `Shootbase Ltd ("we") respects your privacy. This placeholder policy describes the categories of personal data we collect (account, profile, communications, payment metadata), the lawful bases under UK GDPR (contract, legitimate interests, consent), retention periods, your rights (access, rectification, erasure, portability, objection), and how to contact our data controller. Replace this body with full final wording before launch.`,
  ),
});
