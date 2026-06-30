import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ProShell } from "@/components/site/ProShell";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/refer")({
  head: () => ({ meta: [{ title: "Refer a Friend — Shootbase" }, { name: "robots", content: "noindex" }] }),
  component: ReferPage,
});

function ReferPage() {
  const { proSlug } = useRole();
  const [copied, setCopied] = useState(false);
  const link = proSlug ? `https://www.shootbase.co.uk/${proSlug}` : null;

  return (
    <ProShell>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl mb-2">Refer a friend</h1>
        <p className="text-sm text-ink/60 mb-8">
          You and your referral each receive 15 coins after the referral purchases at least 50 coins.
        </p>

        {link ? (
          <div className="border border-ink/10 p-6">
            <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">Your referral link</p>
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 border border-ink/15 px-3 py-2 text-sm bg-paper" />
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                  toast.success("Link copied");
                }}
                className="bg-ink text-paper px-4 py-2 text-xs uppercase tracking-widest hover:bg-gold"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className="border border-ink/10 p-6 text-sm text-ink/70">
            Create your Pro profile to get your referral link.
          </div>
        )}
      </div>
    </ProShell>
  );
}
