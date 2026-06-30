import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deleteMyAccount } from "@/lib/account.functions";
import { performSignOut } from "@/lib/auth-signout";

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);

  if (!open) return null;
  const canConfirm = value === "DELETE" && !busy;

  async function onConfirm() {
    setBusy(true);
    try {
      await deleteFn({ data: { confirm: "DELETE" } });
      await performSignOut(qc);
      toast.success("Your account has been permanently deleted");
      await navigate({ to: "/" });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : "Failed to delete account");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-paper border border-ink/20 max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-2xl">Delete your account?</h3>
        <p className="text-sm text-ink/70">
          This action is <span className="font-medium">permanent and cannot be undone</span>. Your
          profile, listings, portfolio, notifications and sign-in (including any Google or Apple
          link) will be removed. Conversations and reviews other people rely on will remain but
          will appear as “Deleted User”.
        </p>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-ink/60">
            Type DELETE to confirm
          </span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border border-ink/20 px-3 py-2 mt-1 bg-white"
            placeholder="DELETE"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-xs uppercase tracking-widest border border-ink/20 hover:bg-ink/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-xs uppercase tracking-widest bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Deleting…" : "Delete My Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-red-300 p-6 bg-red-50/40 space-y-3">
      <h2 className="font-display text-2xl text-red-700">Danger Zone</h2>
      <p className="text-sm text-ink/70">
        Permanently delete your Shootbase account and personal data. This cannot be undone.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-red-600 text-white px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-red-700"
      >
        Delete My Account
      </button>
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
