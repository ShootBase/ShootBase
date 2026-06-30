import { supabase } from "@/integrations/supabase/client";

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_ATTACHMENTS = 5;

export type UploadedAttachment = {
  storage_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
};

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export async function uploadMessageAttachments(
  qrId: string,
  files: File[],
): Promise<UploadedAttachment[]> {
  const uploads: UploadedAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" exceeds the 15 MB limit.`);
    }
    const uid = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const path = `${qrId}/${uid}-${sanitize(file.name)}`;
    const { error } = await supabase
      .storage
      .from("message-attachments")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
    uploads.push({
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    });
  }
  return uploads;
}
