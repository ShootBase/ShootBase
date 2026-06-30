import { Instagram, Facebook, Linkedin, Twitter, Youtube, Music2, Globe } from "lucide-react";

export type SocialLinksProps = {
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
  size?: number;
  className?: string;
};

function clean(v: string) {
  return v.trim().replace(/^@/, "").replace(/\/$/, "");
}

function ensureUrl(v: string) {
  const t = v.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function buildHandleUrl(host: string, v: string) {
  const t = v.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${host}/${clean(t)}`;
}

type Item = { href: string; label: string; Icon: typeof Instagram };

export function SocialLinks({
  website,
  instagram,
  facebook,
  twitter,
  tiktok,
  youtube,
  linkedin,
  size = 16,
  className = "",
}: SocialLinksProps) {
  const items: Item[] = [];
  if (website?.trim()) items.push({ href: ensureUrl(website), label: "Website", Icon: Globe });
  if (instagram?.trim()) items.push({ href: buildHandleUrl("instagram.com", instagram), label: "Instagram", Icon: Instagram });
  if (facebook?.trim()) items.push({ href: buildHandleUrl("facebook.com", facebook), label: "Facebook", Icon: Facebook });
  if (twitter?.trim()) items.push({ href: buildHandleUrl("x.com", twitter), label: "X (Twitter)", Icon: Twitter });
  if (tiktok?.trim()) {
    const t = tiktok.trim();
    const href = /^https?:\/\//i.test(t) ? t : `https://tiktok.com/@${clean(t)}`;
    items.push({ href, label: "TikTok", Icon: Music2 });
  }
  if (youtube?.trim()) {
    const t = youtube.trim();
    const href = /^https?:\/\//i.test(t) ? t : `https://youtube.com/@${clean(t)}`;
    items.push({ href, label: "YouTube", Icon: Youtube });
  }
  if (linkedin?.trim()) {
    const t = linkedin.trim();
    const href = /^https?:\/\//i.test(t) ? t : `https://linkedin.com/in/${clean(t)}`;
    items.push({ href, label: "LinkedIn", Icon: Linkedin });
  }

  if (!items.length) return null;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {items.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="text-ink/60 hover:text-gold transition-colors"
        >
          <Icon size={size} />
        </a>
      ))}
    </div>
  );
}
