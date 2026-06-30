import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listServices } from "@/lib/marketplace.functions";
import { PostJobModal } from "@/components/home/PostJobModal";
import { SiteHeader } from "@/components/site/Header";
import { SiteFooter } from "@/components/site/Footer";

export const Route = createFileRoute("/customer/post-lead")({
  head: () => ({
    meta: [
      { title: "Post a job — Shootbase" },
      { name: "description", content: "Tell Shootbase what you need and get quotes from trusted UK photographers and videographers." },
      { property: "og:title", content: "Post a job — Shootbase" },
      { property: "og:description", content: "Tell Shootbase what you need and get quotes from trusted UK photographers and videographers." },
    ],
    links: [{ rel: "canonical", href: "/customer/post-lead" }],
  }),
  loader: async () => ({ services: await listServices() }),
  component: PostLeadPage,
});

function PostLeadPage() {
  const { services } = Route.useLoaderData() as {
    services: Array<{ id: string; slug: string; name: string; kind: "photography" | "videography"; sort_order: number }>;
  };
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  useEffect(() => setOpen(true), []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) navigate({ to: "/" });
  }

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-gold font-semibold mb-3">Post a job</p>
        <h1 className="font-display text-4xl md:text-5xl mb-4">Tell us what you need</h1>
        <p className="text-sm text-ink/60 max-w-xl mx-auto mb-8">
          Complete the request first. Account creation happens after, so your project details are captured before sign-in.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-gold transition-colors"
        >
          Open Job Request Form
        </button>
      </main>
      <PostJobModal services={services} open={open} onOpenChange={handleOpenChange} />
      <SiteFooter />
    </div>
  );
}