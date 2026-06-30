import { Badge } from "@/components/ui/badge";
import { Crown, Coins, AlertTriangle, Moon } from "lucide-react";

const META: Record<string, { label: string; cls: string; Icon: any }> = {
  vip: { label: "VIP", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", Icon: Crown },
  high_spender: { label: "High spender", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", Icon: Coins },
  risky: { label: "Risky", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30", Icon: AlertTriangle },
  inactive: { label: "Inactive", cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30", Icon: Moon },
};

export function UserTagBadge({ tag, source, compact = false }: { tag: string; source?: string; compact?: boolean }) {
  const m = META[tag];
  if (!m) return null;
  const { Icon } = m;
  return (
    <Badge variant="outline" className={`gap-1 capitalize ${m.cls} ${compact ? "text-[10px] px-1.5 py-0" : ""}`} title={source === "manual" ? "Manually assigned" : "Auto-assigned"}>
      <Icon className="h-3 w-3" />
      {m.label}
      {source === "manual" && <span className="opacity-60 ml-0.5">·m</span>}
    </Badge>
  );
}

export function UserTagBadges({ tags, compact = false }: { tags?: { tag: string; source?: string }[]; compact?: boolean }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => <UserTagBadge key={t.tag} tag={t.tag} source={t.source} compact={compact} />)}
    </div>
  );
}

export const ALL_TAGS = ["vip", "high_spender", "risky", "inactive"] as const;
export const TAG_LABEL: Record<string, string> = {
  vip: "VIP",
  high_spender: "High spender",
  risky: "Risky",
  inactive: "Inactive",
};
