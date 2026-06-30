import { useState } from "react";
import { InvitedProsList } from "./InvitedProsList";

export function JobInvitedProsToggle({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] uppercase tracking-[0.16em] font-medium bg-ink text-paper px-3 py-1.5 rounded-full hover:bg-brass transition-colors"
      >
        {open ? "Hide requested pros ▾" : "Requested pros ▸"}
      </button>
      {open && (
        <div className="basis-full mt-2">
          <InvitedProsList jobId={jobId} />
        </div>
      )}
    </>
  );
}
