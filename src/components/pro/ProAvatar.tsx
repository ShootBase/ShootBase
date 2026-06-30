import { useMemo } from "react";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-12 w-12 text-xs",
  lg: "h-16 w-16 text-sm",
  xl: "h-24 w-24 text-base",
};

export function ProAvatar({
  proId,
  hasAvatar,
  name,
  size = "md",
  shape = "circle",
  className = "",
  src,
}: {
  proId?: string | null;
  hasAvatar?: boolean;
  name?: string | null;
  size?: Size;
  shape?: "circle" | "square";
  className?: string;
  src?: string | null;
}) {
  const initials = useMemo(() => {
    const n = (name ?? "").trim();
    if (!n) return "•";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("");
  }, [name]);

  const radius = shape === "circle" ? "rounded-full" : "rounded";
  const base = `inline-flex items-center justify-center overflow-hidden border border-ink/10 bg-paper shrink-0 ${SIZE_CLASS[size]} ${radius} ${className}`;

  const url = src ?? (proId && hasAvatar ? `/api/public/avatar/${proId}` : null);

  if (url) {
    return (
      <span className={base}>
        <img
          src={url}
          alt={name ?? "Professional"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }
  return (
    <span className={`${base} bg-ink/5 font-display text-ink/60 uppercase tracking-widest`}>{initials}</span>
  );
}
