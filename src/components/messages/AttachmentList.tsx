import { FileText, Image as ImageIcon, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { signMessageAttachment, type MessageAttachment } from "@/lib/messages.functions";

function formatSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentList({
  attachments,
  mine,
}: {
  attachments: MessageAttachment[];
  mine?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function open(a: MessageAttachment) {
    setBusy(a.id);
    try {
      const { url } = await signMessageAttachment({ data: { attachment_id: a.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not open attachment");
    } finally {
      setBusy(null);
    }
  }

  if (!attachments?.length) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {attachments.map((a) => {
        const isImg = (a.mime_type ?? "").startsWith("image/");
        const Icon = isImg ? ImageIcon : FileText;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => void open(a)}
            disabled={busy === a.id}
            className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 text-xs transition ${
              mine
                ? "bg-paper/10 hover:bg-paper/15 text-paper"
                : "bg-zinc-100 hover:bg-zinc-200 text-ink"
            }`}
            title={`Open ${a.filename}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate flex-1">{a.filename}</span>
            {a.size_bytes ? (
              <span className={`shrink-0 ${mine ? "opacity-60" : "text-ink/50"}`}>
                {formatSize(a.size_bytes)}
              </span>
            ) : null}
            {busy === a.id ? (
              <Loader2 className="h-3 w-3 animate-spin opacity-80" />
            ) : (
              <Download className="h-3 w-3 opacity-70" />
            )}
          </button>
        );
      })}
    </div>
  );
}
