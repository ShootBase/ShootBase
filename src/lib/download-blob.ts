/**
 * Force a file download from any URL, including cross-origin signed URLs
 * (Supabase Storage), where the HTML `download` attribute is otherwise ignored.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
