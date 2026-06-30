import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role-context";
import { SiteHeader } from "@/components/site/Header";
import { ProShell } from "@/components/site/ProShell";
import { DashboardFooter } from "@/components/site/DashboardFooter";
import { ClientMobileNav } from "@/components/site/ClientMobileNav";
import { createSupportRequest } from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Customer Support — Shootbase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HelpPage,
});

const CLIENT_CATEGORIES = [
  "Report a Professional",
  "Report an Issue",
  "Job posted issue",
  "Messaging Issue",
  "Account Issue",
  "Technical Problem",
  "General Support",
  "Other",
];

const PRO_CATEGORIES = [
  "Payments & Coins",
  "Project Access Issues",
  "Invalid Client Contact",
  "Project Dispute",
  "Client Requests",
  "Booking Issues",
  "Professional Account",
  "Technical Problem",
  "Report a User",
  "Other",
];

function HelpForm({ categories }: { categories: string[] }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please describe your issue.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      const attachment_paths: string[] = [];

      if (userId && files.length > 0) {
        for (const file of files.slice(0, 10)) {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${userId}/${Date.now()}-${safe}`;
          const { error } = await supabase.storage
            .from("support-attachments")
            .upload(path, file, { upsert: false });
          if (error) {
            toast.error(`Failed to upload ${file.name}: ${error.message}`);
            continue;
          }
          attachment_paths.push(path);
        }
      }

      await createSupportRequest({
        data: {
          subject: subject.trim() || null,
          message: message.trim(),
          category: category || null,
          attachment_paths,
        },
      });
      setSubmitted(true);
      setSubject("");
      setMessage("");
      setCategory("");
      setFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="border border-ink/10 bg-white p-8 text-center">
        <p className="font-display text-2xl mb-3">Thanks — your request has been sent.</p>
        <p className="text-sm text-ink/70 mb-2">
          We've emailed a confirmation to your inbox from{" "}
          <span className="font-medium">support@shootbase.co.uk</span>.
        </p>
        <p className="text-sm text-ink/70 mb-6">
          Our support team will respond within 24–48 hours. You can simply reply to that
          email to add more details.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="text-xs uppercase tracking-widest border border-ink px-5 py-2 hover:bg-ink hover:text-paper transition-all"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 border border-ink/10 bg-white p-6 md:p-8">
      <div>
        <label className="block text-[11px] uppercase tracking-widest text-ink/70 mb-2">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary (e.g. 'Coins not credited')"
          maxLength={200}
          className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-widest text-ink/70 mb-2">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-ink/15 px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold"
        >
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-widest text-ink/70 mb-2">
          Message <span className="text-destructive">*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what's wrong or what you need help with…"
          rows={7}
          maxLength={5000}
          required
          className="w-full border border-ink/15 px-3 py-2 text-sm focus:outline-none focus:border-gold"
        />
      </div>



      <div>
        <label className="block text-[11px] uppercase tracking-widest text-ink/70 mb-2">
          Add screenshots (optional)
        </label>
        <input
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))}
          className="w-full text-sm"
        />
        {files.length > 0 && (
          <p className="text-[11px] text-ink/60 mt-2">{files.length} file(s) selected</p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="bg-ink text-paper px-6 py-3 text-xs uppercase tracking-widest hover:bg-gold transition-all disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}

function HelpPage() {
  const { loaded, activeRole } = useRole();
  // Hydration-safe: render shell once role known, fallback to client layout
  const [isPro, setIsPro] = useState(false);
  useEffect(() => {
    if (loaded) setIsPro(activeRole === "professional");
  }, [loaded, activeRole]);

  const content = (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
      <div>
        <h1 className="font-display text-4xl mb-2">Need Help?</h1>
        <p className="text-sm text-ink/60 mb-8">
          Your account details are included automatically. Just describe your issue below.
        </p>
        <HelpForm categories={isPro ? PRO_CATEGORIES : CLIENT_CATEGORIES} />
      </div>

      {isPro && (
        <section className="border border-ink/10 bg-white p-6 md:p-8">
          <h2 className="font-display text-2xl mb-3">Reporting Invalid Contact Information</h2>
          <div className="text-sm text-ink/80 space-y-3 leading-relaxed">
            <p>
              We verify all client phone numbers using SMS OTP before publishing projects. However, if
              you unlock a project and discover that the phone number is disconnected or belongs to
              someone else, you may request a credit refund.
            </p>
            <p>
              Navigate to your Unlocked Projects page, open the project, and select &quot;Report Invalid
              Number&quot; within 24 hours of unlocking the project.
            </p>
            <p>
              Our verification system and support team will review the report. If the contact
              information is confirmed invalid, the credits used to unlock the project will be
              returned to your account automatically.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/pro/leads"
              className="text-xs uppercase tracking-widest bg-ink text-paper px-5 py-2.5 hover:bg-gold transition-all"
            >
              Go To Unlocked Projects
            </a>
            <a
              href="/pro/refunds"
              className="text-xs uppercase tracking-widest border border-ink px-5 py-2.5 hover:bg-ink hover:text-paper transition-all"
            >
              View My Refund Requests
            </a>
          </div>
        </section>
      )}
    </div>
  );

  if (isPro) {
    return <ProShell>{content}</ProShell>;
  }
  return (
    <div className="dashboard-readable bg-paper min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">{content}</main>
      <DashboardFooter />
      <ClientMobileNav />
    </div>
  );
}
