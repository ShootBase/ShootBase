import { ProShell } from "@/components/site/ProShell";
import { CitySelect } from "@/components/ui/city-select";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browseLeads, unlockLead, myUnlockedLeads, type MarketplaceLead } from "@/lib/leads.functions";
import { markContactRequestViewed } from "@/lib/contact-requests.functions";
import { triggerAutoTopUpIfLow } from "@/lib/credits.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { getMyCreditsOverview } from "@/lib/credits.functions";
import { listServices } from "@/lib/marketplace.functions";
import {
  markLeadViewed, listViewedLeads,
  toggleLeadFavourite, listFavouriteLeads,
  listSavedViews, saveLeadView, deleteSavedView,
  dismissLead, undismissLead, listDismissedLeads,
} from "@/lib/lead-views.functions";
import { BuyCreditsModal } from "@/components/pro/BuyCreditsModal";
import { PhoneVerificationCard } from "@/components/account/PhoneVerificationCard";
import { CoinIcon } from "@/components/ui/coin-icon";

import { toast } from "sonner";
import { TrustBadges } from "@/components/trust/TrustBadges";
import { LeadQualityBadge, FreshnessBadge, ContactedBadge, PostedAgo } from "@/components/leads/LeadBadges";
import {
  Unlock, MapPin, Calendar, Wallet, Clock, ShieldAlert, Zap, Star,
  Phone, Mail, ChevronLeft, MessageSquare, Search, SlidersHorizontal, Bookmark, Plus,
  Eye, X, Trash2, ThumbsDown, RotateCcw, Copy, Flag,
} from "lucide-react";
import { UrgencyBadge, URGENCY_FILTER_OPTIONS } from "@/components/UrgencyBadge";
import { ReportInvalidNumberModal } from "@/components/pro/ReportInvalidNumberModal";
import { myLeadReports, type MyLeadReport } from "@/lib/lead-reports.functions";
import { detectCountryCode } from "@/lib/country-detect";
import { formatDistance as fmtDistance } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/pro/leads")({
  head: () => ({ meta: [{ title: "Matching projects — Shootbase" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    job: typeof search.job === "string" ? search.job : undefined,
  }),
  component: LeadsPage,
});

type TabKey = "all" | "new" | "urgent" | "favourites" | "mine" | "dismissed";

type UnlockedDetails = {
  job_id: string;
  quote_request_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_verified_phone?: boolean;
  details: string;
};

type SavedView = { id: string; name: string; filters: any };

function LeadsPage() {
  const navigate = useNavigate();
  const { job: jobParam } = Route.useSearch();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const countryCode = detectCountryCode();
  const isNG = countryCode === "NG";
  const distUnitShort = isNG ? "km" : "miles";

  const [hasProfile, setHasProfile] = useState(true);
  const [leads, setLeads] = useState<MarketplaceLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [services, setServices] = useState<Array<{ id: string; name: string; kind: string }>>([]);

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<"" | "photography" | "videography">("");
  const [filterCity, setFilterCity] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterDate, setFilterDate] = useState<"" | "7d" | "30d">("");
  const [filterBudget, setFilterBudget] = useState("");
  const [filterDuration, setFilterDuration] = useState<"" | "short" | "long">("");
  const [filterUrgency, setFilterUrgency] = useState<string>("");
  const [filterDistance, setFilterDistance] = useState<"" | "10" | "25" | "50">("");
  const [filtersOpen, setFiltersOpen] = useState(false);


  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, UnlockedDetails>>({});
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [verifyPhoneFor, setVerifyPhoneFor] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savedMenuOpen, setSavedMenuOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const reloadCredits = useCallback(() => {
    void getMyCreditsOverview().then((c) => {
      if (c.hasProfile) setBalance(c.balance);
    });
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    void browseLeads({
      data: {
        kind: filterKind || undefined,
        city: filterCity || undefined,
        serviceId: filterService || undefined,
      },
    })
      .then((r) => {
        setHasProfile(r.hasProfile);
        const list = (r.leads ?? []) as MarketplaceLead[];
        setLeads(list);
        setSelectedId((prev) => {
          if (jobParam && list.some((l) => l.id === jobParam)) return jobParam;
          return prev && list.some((l) => l.id === prev) ? prev : (list[0]?.id ?? null);
        });
        if (jobParam && list.some((l) => l.id === jobParam)) {
          setMobileView("detail");
          void markContactRequestViewed({ data: { job_id: jobParam } }).catch(() => {});
        }
      })
      .catch((e) => {
        // Don't silently swallow — show the user what happened so they can
        // retry instead of staring at an empty list.
        toast.error(e instanceof Error ? e.message : "Couldn't load projects. Please try again.");
      })
      .finally(() => setLoading(false));
    reloadCredits();
  }, [filterKind, filterCity, filterService, jobParam, reloadCredits]);

  // Initial loads
  const [reportsByJob, setReportsByJob] = useState<Record<string, MyLeadReport>>({});
  const reloadReports = useCallback(() => {
    void myLeadReports().then((rows) => {
      const map: Record<string, MyLeadReport> = {};
      for (const r of rows) map[r.job_id] = r;
      setReportsByJob(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    void listServices().then((s) => setServices(s as typeof services));
    void listFavouriteLeads().then((ids) => {
      setStarred(Object.fromEntries(ids.map((id) => [id, true])));
    });
    void listViewedLeads().then((ids) => setViewedIds(new Set(ids)));
    void listDismissedLeads().then((ids) => setDismissedIds(new Set(ids)));
    void listSavedViews().then((v) => setSavedViews(v as SavedView[]));
    reloadReports();
  }, [reloadReports]);

  useEffect(reload, [reload]);

  // Cmd/Ctrl+K to focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearch("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const baseFiltered = useMemo(() => {
    const now = Date.now();
    return leads.filter((l) => {
      if (filterDate === "7d" && (!l.event_date || new Date(l.event_date).getTime() - now > 7 * 86400000)) return false;
      if (filterDate === "30d" && (!l.event_date || new Date(l.event_date).getTime() - now > 30 * 86400000)) return false;
      if (filterBudget && (l.budget_band ?? "") !== filterBudget) return false;
      if (filterDuration === "short" && (l.duration_hours ?? 0) >= 6) return false;
      if (filterDuration === "long" && (l.duration_hours ?? 0) < 6) return false;
      if (filterUrgency && (l.urgency ?? "") !== filterUrgency) return false;
      if (filterDistance) {
        // In NG mode the dropdown values are kilometres but distance_miles is
        // in miles — convert before capping so the filter matches the label.
        const raw = Number(filterDistance);
        const cap = isNG ? raw / 1.609344 : raw;
        if (l.distance_miles == null || l.distance_miles > cap) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const blob =
          `${l.service_name ?? ""} ${l.city ?? ""} ${l.event_type ?? ""} ${l.summary ?? ""} ${l.details ?? ""} ${l.budget_band ?? ""} ${l.postcode_prefix ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filterDate, filterBudget, filterDuration, filterUrgency, filterDistance, search]);


  const counts = useMemo(() => {
    const notDismissed = baseFiltered.filter((l) => !dismissedIds.has(l.id));
    return {
      all: notDismissed.length,
      new: notDismissed.filter((l) => !viewedIds.has(l.id) && !l.unlocked).length,
      urgent: notDismissed.filter((l) => l.urgency_status === "urgent").length,
      favourites: notDismissed.filter((l) => starred[l.id]).length,
      mine: notDismissed.filter((l) => l.unlocked).length,
      dismissed: baseFiltered.filter((l) => dismissedIds.has(l.id)).length,
    };
  }, [baseFiltered, viewedIds, dismissedIds, starred]);

  const filtered = useMemo(() => {
    return baseFiltered.filter((l) => {
      const isDismissed = dismissedIds.has(l.id);
      if (tab === "dismissed") return isDismissed;
      if (isDismissed) return false;
      if (tab === "new" && (viewedIds.has(l.id) || l.unlocked)) return false;
      if (tab === "urgent" && l.urgency_status !== "urgent") return false;
      if (tab === "favourites" && !starred[l.id]) return false;
      if (tab === "mine" && !l.unlocked) return false;
      return true;
    });
  }, [baseFiltered, tab, viewedIds, dismissedIds, starred]);

  // "Recommended For You": nearby (within priority radius), not unlocked,
  // not dismissed, freshest first. Only shown on the All tab with no
  // explicit distance filter applied.
  const recommended = useMemo(() => {
    if (tab !== "all" || filterDistance) return [] as MarketplaceLead[];
    const pool = filtered.filter((l) => {
      const prio = l.priority_radius_miles ?? 50;
      return l.distance_miles != null && l.distance_miles <= prio && !l.unlocked;
    });
    return pool
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [filtered, tab, filterDistance]);
  const recommendedIds = useMemo(() => new Set(recommended.map((l) => l.id)), [recommended]);


  useEffect(() => {
    if (filtered.length && !filtered.some((l) => l.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // When arriving via ?job=<id> (e.g. from "View & Unlock"), clear filters & switch to All
  // so the deep-linked project is always visible and auto-selected.
  useEffect(() => {
    if (!jobParam) return;
    setTab("all");
    setSearch("");
    setFilterDate("");
    setFilterBudget("");
    setFilterDuration("");
    setFilterUrgency("");
  }, [jobParam]);

  const selected = filtered.find((l) => l.id === selectedId) ?? null;

  // Mark as read when a project is selected (open)
  useEffect(() => {
    if (!selected) return;
    if (viewedIds.has(selected.id)) return;
    setViewedIds((prev) => {
      const next = new Set(prev);
      next.add(selected.id);
      return next;
    });
    void markLeadViewed({ data: { job_id: selected.id } }).catch(() => {});
  }, [selected, viewedIds]);

  const budgetBands = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => { if (l.budget_band) set.add(l.budget_band); });
    return Array.from(set);
  }, [leads]);

  const activeFilterCount =
    (filterKind ? 1 : 0) + (filterService ? 1 : 0) + (filterCity ? 1 : 0) +
    (filterDate ? 1 : 0) + (filterBudget ? 1 : 0) + (filterDuration ? 1 : 0) +
    (filterUrgency ? 1 : 0) + (filterDistance ? 1 : 0);

  const unreadCount = counts.new;

  const clearAllFilters = () => {
    setFilterKind(""); setFilterService(""); setFilterCity("");
    setFilterDate(""); setFilterBudget(""); setFilterDuration("");
    setFilterUrgency(""); setFilterDistance("");
  };


  async function onUnlock(id: string) {
    // Guard against double-click / parallel calls from list+detail panel —
    // without this an in-flight unlockLead can be triggered twice before the
    // DB idempotency check fires, deducting coins twice.
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await unlockLead({ data: { job_id: id } });
      if (!res.ok) {
        if (res.error === "INSUFFICIENT_CREDITS") {
          toast.error("Not enough coins. Buy more to unlock this project.");
          setBuyCreditsOpen(true);

        }
        else if (res.error === "LEAD_EXPIRED") toast.error("This project has expired.");
        else if (res.error === "NOT_MATCHED") toast.error("You weren't matched to this project.");
        else if (res.error === "LEAD_FULL") toast.error("This project has already been contacted by 5 pros.");
        else toast.error("Failed to unlock");
      } else {
        toast.success("Client contact revealed.");
        if (res.lead) setRevealed((p) => ({ ...p, [id]: res.lead as UnlockedDetails }));
        reload();
        void myUnlockedLeads();
        try {
          const tu = await triggerAutoTopUpIfLow({ data: { environment: getStripeEnvironment() } });
          if (tu.triggered) toast.success("Auto top-up charged your saved card.");
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to unlock";
      if (/PRO_VERIFICATION_REQUIRED/.test(msg)) {
        if (/email/.test(msg) && !/phone/.test(msg)) {
          toast.error("Please verify your email address before unlocking projects. See the banner at the top of the page.");
        } else {
          // Pause unlock and show inline phone verification — auto-resume on success.
          setVerifyPhoneFor(id);
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function onMessageClient(id: string) {
    if (busyId) return;
    const cached = revealed[id];
    if (cached?.quote_request_id) {
      navigate({ to: "/threads/$id", params: { id: cached.quote_request_id } });
      return;
    }
    setBusyId(id);
    try {
      const res = await unlockLead({ data: { job_id: id } });
      if (res.ok && res.lead) {
        setRevealed((p) => ({ ...p, [id]: res.lead as UnlockedDetails }));
        navigate({ to: "/threads/$id", params: { id: (res.lead as UnlockedDetails).quote_request_id } });
      } else {
        toast.error("Could not open conversation");
      }
    } finally {
      setBusyId(null);
    }
  }

  const toggleStar = (id: string) => {
    const next = !starred[id];
    setStarred((p) => ({ ...p, [id]: next }));
    void toggleLeadFavourite({ data: { job_id: id, starred: next } })
      .then(() => toast.success(next ? "Saved to favourites" : "Removed from favourites"))
      .catch(() => {
        setStarred((p) => ({ ...p, [id]: !next }));
        toast.error("Couldn't update favourite");
      });
  };

  const onDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void dismissLead({ data: { job_id: id } })
      .then(() => toast.success("Marked as not interested"))
      .catch(() => {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error("Couldn't dismiss project");
      });
  };

  const onUndismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    void undismissLead({ data: { job_id: id } })
      .then(() => toast.success("Restored to projects"))
      .catch(() => {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        toast.error("Couldn't restore project");
      });
  };

  async function onSaveCurrentView() {
    const name = saveName.trim();
    if (!name) return;
    try {
      const v = await saveLeadView({
        data: {
          name,
          filters: {
            search, kind: filterKind, city: filterCity, service: filterService,
            date: filterDate, budget: filterBudget, duration: filterDuration,
            urgency: filterUrgency, tab,
          },
        },
      });
      setSavedViews((p) => [v as SavedView, ...p]);
      setSaveDialogOpen(false);
      setSaveName("");
      toast.success("View saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save view");
    }
  }

  function loadSavedView(v: SavedView) {
    const f = v.filters ?? {};
    setSearch(f.search ?? "");
    setFilterKind(f.kind ?? "");
    setFilterCity(f.city ?? "");
    setFilterService(f.service ?? "");
    setFilterDate(f.date ?? "");
    setFilterBudget(f.budget ?? "");
    setFilterDuration(f.duration ?? "");
    setFilterUrgency(f.urgency ?? "");
    setTab((f.tab as TabKey) ?? "all");
    setSavedMenuOpen(false);
    toast.success(`Loaded "${v.name}"`);
  }

  async function onDeleteSavedView(id: string) {
    try {
      await deleteSavedView({ data: { id } });
      setSavedViews((p) => p.filter((v) => v.id !== id));
    } catch {
      toast.error("Couldn't delete view");
    }
  }

  return (
    <ProShell>
      <div className="bg-[#FAFAF8] min-h-screen">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-8 py-5 sm:py-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 sm:gap-6 flex-wrap mb-4 sm:mb-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl tracking-tight text-[#1E1E1E]">Matching projects</h1>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-[#FBF1DC] text-[#9A6B14] text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[#6B6B6B] mt-1 sm:mt-1.5">Creative projects that match your services and city.</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="pl-9 pr-16 py-2.5 w-[280px] bg-white border border-[#E8E5DF] rounded-lg text-sm focus:outline-none focus:border-[#D6A23D] focus:ring-2 focus:ring-[#D6A23D]/15 transition"
                />
                {search ? (
                  <button
                    onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#1E1E1E]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#6B6B6B] bg-[#F4F2EC] border border-[#E8E5DF] rounded px-1.5 py-0.5">⌘K</kbd>
                )}
              </div>
              <button
                onClick={() => setFiltersOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E8E5DF] rounded-lg text-sm text-[#1E1E1E] hover:border-[#D6A23D] hover:shadow-sm transition"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-[#D6A23D] text-white text-[10px] font-semibold w-5 h-5 inline-flex items-center justify-center rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setSavedMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E8E5DF] rounded-lg text-sm text-[#1E1E1E] hover:border-[#D6A23D] hover:shadow-sm transition"
                >
                  <Bookmark className="h-4 w-4" />
                  Save view
                </button>
                {savedMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-30 w-72 bg-white border border-[#E8E5DF] rounded-lg shadow-lg p-2">
                    <button
                      onClick={() => { setSaveDialogOpen(true); setSavedMenuOpen(false); }}
                      className="w-full text-left text-sm text-[#1E1E1E] px-3 py-2 rounded hover:bg-[#F4F2EC] flex items-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5" /> Save current view…
                    </button>
                    {savedViews.length > 0 && (
                      <>
                        <div className="border-t border-[#E8E5DF] my-2" />
                        <p className="text-[10px] uppercase tracking-wider text-[#9A9690] px-3 mb-1">Saved</p>
                        {savedViews.map((v) => (
                          <div key={v.id} className="flex items-center group">
                            <button
                              onClick={() => loadSavedView(v)}
                              className="flex-1 text-left text-sm text-[#1E1E1E] px-3 py-2 rounded hover:bg-[#F4F2EC] truncate"
                            >
                              {v.name}
                            </button>
                            <button
                              onClick={() => onDeleteSavedView(v.id)}
                              aria-label={`Delete ${v.name}`}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-[#9A9690] hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border-2 border-[#D6A23D]/60 bg-gradient-to-br from-[#FFF7E0] to-[#F1CE74] shadow-sm">
                <CoinIcon size={22} />
                <span className="font-display text-[18px] leading-none text-[#3A2A08]">{balance}</span>
                <span className="text-[13px] uppercase tracking-widest text-[#7A5A12] font-semibold">
                  {balance === 1 ? "Coin" : "Coins"}
                </span>
              </div>
              <button
                onClick={() => setBuyCreditsOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#D6A23D] text-white rounded-lg text-[16px] font-semibold hover:bg-[#c39231] shadow-sm hover:shadow transition"
              >
                <Plus className="h-4 w-4" />
                Buy coins
              </button>

            </div>
          </div>

          {/* Filter bar */}
          <div className="flex gap-2 flex-wrap mb-5">
            <FilterChip icon={<MapPin className="h-3.5 w-3.5" />} label="Location" active={!!filterCity}>
              <div className="w-44"><CitySelect value={filterCity} onChange={setFilterCity} placeholder="All locations" /></div>
            </FilterChip>
            <SelectChip
              label="Distance"
              value={filterDistance}
              onChange={(v) => setFilterDistance(v as typeof filterDistance)}
              options={[
                { value: "", label: isNG ? "Nigeria-wide" : "Nationwide" },
                { value: "10", label: `Within 10 ${distUnitShort}` },
                { value: "25", label: `Within 25 ${distUnitShort}` },
                { value: "50", label: `Within 50 ${distUnitShort}` },
              ]}
            />

            <SelectChip
              label="Service"
              value={filterService}
              onChange={setFilterService}
              options={[{ value: "", label: "All services" }, ...services.filter((s) => !filterKind || s.kind === filterKind).map((s) => ({ value: s.id, label: s.name }))]}
            />
            <SelectChip
              label="Budget"
              value={filterBudget}
              onChange={setFilterBudget}
              options={[{ value: "", label: "Any budget" }, ...budgetBands.map((b) => ({ value: b, label: b }))]}
            />
            <SelectChip
              label="Date"
              value={filterDate}
              onChange={(v) => setFilterDate(v as typeof filterDate)}
              options={[
                { value: "", label: "Any date" },
                { value: "7d", label: "Next 7 days" },
                { value: "30d", label: "Next 30 days" },
              ]}
            />
            <SelectChip
              label="Availability"
              value={filterDuration}
              onChange={(v) => setFilterDuration(v as typeof filterDuration)}
              options={[
                { value: "", label: "Any time" },
                { value: "short", label: "Under 6 hours" },
                { value: "long", label: "6+ hours" },
              ]}
            />
            <SelectChip
              label="Type"
              value={filterKind}
              onChange={(v) => setFilterKind(v as typeof filterKind)}
              options={[
                { value: "", label: "Photo & video" },
                { value: "photography", label: "Photography" },
                { value: "videography", label: "Videography" },
              ]}
            />
            <SelectChip
              label="Urgency"
              value={filterUrgency}
              onChange={setFilterUrgency}
              options={URGENCY_FILTER_OPTIONS.map((u) => ({ value: u.id, label: u.label }))}
            />
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-[#6B6B6B] hover:text-[#1E1E1E] transition"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-[#E8E5DF] mb-6 overflow-x-auto">
            {([
              ["all", "All", counts.all],
              ["new", "Unread", counts.new],
              ["urgent", "Urgent", counts.urgent],
              ["favourites", "Favourites", counts.favourites],
              ["mine", "My responses", counts.mine],
              ["dismissed", "Not interested", counts.dismissed],
            ] as Array<[TabKey, string, number]>).map(([k, label, count]) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`relative shrink-0 px-4 py-3 text-sm font-medium transition ${
                    active ? "text-[#D6A23D]" : "text-[#6B6B6B] hover:text-[#1E1E1E]"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {label}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      active ? "bg-[#FBF1DC] text-[#9A6B14]" : "bg-[#F4F2EC] text-[#6B6B6B]"
                    }`}>{count}</span>
                  </span>
                  {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#D6A23D]" />}
                </button>
              );
            })}
          </div>

          {!hasProfile && (
            <div className="border border-[#D6A23D]/30 bg-[#FBF1DC]/40 p-6 mb-6 rounded-xl">
              <p className="font-display text-xl mb-2 text-[#1E1E1E]">Set up your pro profile first</p>
              <Link to="/pro/onboarding" className="bg-[#1E1E1E] text-white px-6 py-3 text-xs uppercase tracking-widest font-medium hover:bg-[#D6A23D] inline-block mt-2 rounded-lg transition">
                Build profile
              </Link>
            </div>
          )}

          {/* Main split */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6">
            {/* Grid of cards */}
            <div className={`${mobileView === "detail" ? "hidden lg:block" : ""}`}>
              {loading ? (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="border border-[#E8E5DF] bg-white rounded-xl p-4 h-44 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="border border-dashed border-[#E8E5DF] bg-white p-16 text-center rounded-xl">
                  <p className="font-display text-xl text-[#1E1E1E] mb-1">No matching projects</p>
                  <p className="text-sm text-[#6B6B6B] mb-4">
                    {activeFilterCount > 0 || search
                      ? "Try widening your filters, or clear them."
                      : "Check back soon — new projects appear as clients post."}
                  </p>
                  {(activeFilterCount > 0 || search) && (
                    <button
                      onClick={() => { clearAllFilters(); setSearch(""); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest bg-[#1E1E1E] text-white rounded-lg hover:bg-[#D6A23D] transition"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {recommended.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-baseline justify-between mb-3">
                        <h2 className="font-display text-lg text-[#1E1E1E]">Recommended for you</h2>
                        <span className="text-xs text-[#9A6B14] bg-[#FBF1DC] border border-[#F0E0B5] rounded-full px-2 py-0.5">
                          Within {isNG ? Math.round((recommended[0]?.priority_radius_miles ?? 50) * 1.609344) : (recommended[0]?.priority_radius_miles ?? 50)} {distUnitShort}
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {recommended.map((l) => (
                          <LeadCard
                            key={`rec-${l.id}`}
                            lead={l}
                            active={l.id === selectedId}
                            starred={!!starred[l.id]}
                            unread={!viewedIds.has(l.id) && !l.unlocked}
                            dismissed={dismissedIds.has(l.id)}
                            onStar={() => toggleStar(l.id)}
                            onDismiss={() => onDismiss(l.id)}
                            onUndismiss={() => onUndismiss(l.id)}
                            onClick={() => { setSelectedId(l.id); setMobileView("detail"); }}
                          />
                        ))}
                      </div>
                      <div className="border-t border-[#E8E5DF] mt-6 mb-4" />
                      <h2 className="font-display text-lg text-[#1E1E1E] mb-3">All projects</h2>
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.filter((l) => !recommendedIds.has(l.id)).map((l) => (
                      <LeadCard
                        key={l.id}
                        lead={l}
                        active={l.id === selectedId}
                        starred={!!starred[l.id]}
                        unread={!viewedIds.has(l.id) && !l.unlocked}
                        dismissed={dismissedIds.has(l.id)}
                        onStar={() => toggleStar(l.id)}
                        onDismiss={() => onDismiss(l.id)}
                        onUndismiss={() => onUndismiss(l.id)}
                        onClick={() => { setSelectedId(l.id); setMobileView("detail"); }}
                      />
                    ))}
                  </div>
                </>

              )}
            </div>

            {/* Detail panel */}
            <div className={`${mobileView === "list" ? "hidden lg:block" : ""}`}>
              <div className="lg:sticky lg:top-6">
                {selected ? (
                  <LeadDetails
                    lead={selected}
                    balance={balance}
                    busy={busyId === selected.id}
                    starred={!!starred[selected.id]}
                    dismissed={dismissedIds.has(selected.id)}
                    onStar={() => toggleStar(selected.id)}
                    onDismiss={() => onDismiss(selected.id)}
                    onUndismiss={() => onUndismiss(selected.id)}
                    onUnlock={() => onUnlock(selected.id)}
                    onMessageClient={() => onMessageClient(selected.id)}
                    onBuyCredits={() => setBuyCreditsOpen(true)}
                    revealed={revealed[selected.id]}
                    onBack={() => setMobileView("list")}
                    existingReport={reportsByJob[selected.id] ?? null}
                    onReported={reloadReports}
                  />
                ) : (
                  <div className="border border-[#E8E5DF] bg-white p-10 text-center text-sm text-[#6B6B6B] rounded-xl">
                    Select a project to see full details.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buy credits modal */}
      <BuyCreditsModal
        open={buyCreditsOpen}
        onClose={() => setBuyCreditsOpen(false)}
        onPurchased={reloadCredits}
      />

      {/* Phone verification gate for unlock — auto-resumes the original unlock on success */}
      {verifyPhoneFor && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setVerifyPhoneFor(null)}
        >
          <div className="bg-white max-w-md w-full p-6 rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[#FBF1DC] border border-[#D6A23D]/40 flex items-center justify-center text-2xl">📱</div>
              <h3 className="font-display text-xl text-[#1E1E1E] mb-1">Verify your mobile number to unlock projects</h3>
              <p className="text-xs text-[#6B6B6B]">
                To maintain a trusted marketplace, all professionals must verify their phone number before contacting clients.
              </p>
            </div>
            <PhoneVerificationCard
              initialPhone=""
              verified={false}
              onVerified={async () => {
                const pendingId = verifyPhoneFor;
                setVerifyPhoneFor(null);
                toast.success("✅ Mobile number verified successfully. Unlocking project…");
                if (pendingId) await onUnlock(pendingId);
              }}
            />
            <button
              type="button"
              onClick={() => setVerifyPhoneFor(null)}
              className="mt-4 w-full text-[11px] uppercase tracking-widest text-[#6B6B6B] hover:text-[#1E1E1E]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Save view dialog */}
      {saveDialogOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSaveDialogOpen(false)}>
          <div className="bg-white max-w-md w-full p-6 rounded-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl mb-1 text-[#1E1E1E]">Name this view</p>
            <p className="text-xs text-[#6B6B6B] mb-4">
              Save the current search, filters, and tab as a reusable view.
            </p>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSaveCurrentView(); }}
              placeholder="e.g. London weddings this month"
              className="w-full border border-[#E8E5DF] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#D6A23D] focus:ring-2 focus:ring-[#D6A23D]/15"
              maxLength={80}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setSaveDialogOpen(false)}
                className="text-xs uppercase tracking-widest border border-[#E8E5DF] rounded-lg px-4 py-2 text-[#6B6B6B] hover:bg-[#F4F2EC]"
              >
                Cancel
              </button>
              <button
                onClick={onSaveCurrentView}
                disabled={!saveName.trim()}
                className="text-xs uppercase tracking-widest bg-[#1E1E1E] text-white rounded-lg px-4 py-2 hover:bg-[#D6A23D] disabled:opacity-50"
              >
                Save view
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => setFiltersOpen(false)}>
          <div className="bg-white w-full max-w-md h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E5DF]">
              <p className="font-display text-xl text-[#1E1E1E]">Filters</p>
              <button onClick={() => setFiltersOpen(false)} aria-label="Close" className="text-[#6B6B6B] hover:text-[#1E1E1E]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <DrawerField label="Location">
                <CitySelect value={filterCity} onChange={setFilterCity} placeholder="All locations" />
              </DrawerField>
              <DrawerField label="Type">
                <PlainSelect value={filterKind} onChange={(v) => setFilterKind(v as typeof filterKind)} options={[
                  { value: "", label: "Photo & video" },
                  { value: "photography", label: "Photography" },
                  { value: "videography", label: "Videography" },
                ]} />
              </DrawerField>
              <DrawerField label="Service">
                <PlainSelect value={filterService} onChange={setFilterService} options={[
                  { value: "", label: "All services" },
                  ...services.filter((s) => !filterKind || s.kind === filterKind).map((s) => ({ value: s.id, label: s.name })),
                ]} />
              </DrawerField>
              <DrawerField label="Budget">
                <PlainSelect value={filterBudget} onChange={setFilterBudget} options={[
                  { value: "", label: "Any budget" },
                  ...budgetBands.map((b) => ({ value: b, label: b })),
                ]} />
              </DrawerField>
              <DrawerField label="Date">
                <PlainSelect value={filterDate} onChange={(v) => setFilterDate(v as typeof filterDate)} options={[
                  { value: "", label: "Any date" },
                  { value: "7d", label: "Next 7 days" },
                  { value: "30d", label: "Next 30 days" },
                ]} />
              </DrawerField>
              <DrawerField label="Availability">
                <PlainSelect value={filterDuration} onChange={(v) => setFilterDuration(v as typeof filterDuration)} options={[
                  { value: "", label: "Any time" },
                  { value: "short", label: "Under 6 hours" },
                  { value: "long", label: "6+ hours" },
                ]} />
              </DrawerField>
              <DrawerField label="Urgency">
                <PlainSelect value={filterUrgency} onChange={setFilterUrgency} options={URGENCY_FILTER_OPTIONS.map((u) => ({ value: u.id, label: u.label }))} />
              </DrawerField>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[#E8E5DF] px-5 py-3 flex justify-between gap-3">
              <button
                onClick={() => { clearAllFilters(); }}
                className="text-xs uppercase tracking-widest border border-[#E8E5DF] rounded-lg px-4 py-2 text-[#6B6B6B] hover:bg-[#F4F2EC]"
              >
                Clear all
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                className="text-xs uppercase tracking-widest bg-[#1E1E1E] text-white rounded-lg px-4 py-2 hover:bg-[#D6A23D]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </ProShell>
  );
}

function DrawerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function PlainSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white border border-[#E8E5DF] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#D6A23D] focus:ring-2 focus:ring-[#D6A23D]/15"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function FilterChip({ icon, label, active, children }: { icon: React.ReactNode; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <div className={`inline-flex items-center gap-2 bg-white border rounded-lg pl-3 pr-1 py-1 transition hover:shadow-sm ${active ? "border-[#D6A23D]" : "border-[#E8E5DF] hover:border-[#D6A23D]/50"}`}>
      <span className="text-[#6B6B6B]">{icon}</span>
      <span className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">{label}</span>
      {children}
    </div>
  );
}

function SelectChip({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const active = !!value;
  return (
    <label className={`inline-flex items-center gap-2 bg-white border rounded-lg px-3 py-2 transition hover:shadow-sm cursor-pointer ${active ? "border-[#D6A23D]" : "border-[#E8E5DF] hover:border-[#D6A23D]/50"}`}>
      <span className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm text-[#1E1E1E] focus:outline-none cursor-pointer"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function durationLabel(l: MarketplaceLead): string | null {
  if (l.duration) return l.duration;
  if (l.duration_hours) return `${l.duration_hours}h`;
  if (l.duration_days) return `${l.duration_days}d`;
  return null;
}

function formatDistance(miles: number): string {
  // Country-aware unit. Falls back to miles on the server.
  return fmtDistance(miles, typeof window === "undefined" ? "GB" : detectCountryCode());
}


import photoIconAsset from "@/assets/shootbase-photo-icon.png.asset.json";
import videoIconAsset from "@/assets/shootbase-video-icon.png.asset.json";

function ServiceIcons({ kind }: { kind: string }) {
  const k = (kind || "").toLowerCase();
  const isBoth = k === "both" || (k.includes("photo") && k.includes("video"));
  const showPhoto = isBoth || k.includes("photo") || k === "";
  const showVideo = isBoth || k.includes("video");
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      {showPhoto && (
        <img
          src={photoIconAsset.url}
          alt="Photography"
          aria-label="Photography"
          className="h-5 w-5 sm:h-[22px] sm:w-[22px] object-contain select-none"
          draggable={false}
        />
      )}
      {showVideo && (
        <img
          src={videoIconAsset.url}
          alt="Videography"
          aria-label="Videography"
          className="h-5 w-5 sm:h-[22px] sm:w-[22px] object-contain select-none"
          draggable={false}
        />
      )}
    </span>
  );
}

function CardThumbnail({ src }: { src: string }) {
  return (
    <div className="relative h-36 sm:h-40 w-full rounded-lg overflow-hidden mb-4 bg-[#F4F2EC]">
      <img
        src={src}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
      />
    </div>
  );
}

function LeadCard({ lead, active, starred, unread, dismissed, onStar, onDismiss, onUndismiss, onClick }:
  { lead: MarketplaceLead; active: boolean; starred: boolean; unread: boolean; dismissed: boolean; onStar: () => void; onDismiss: () => void; onUndismiss: () => void; onClick: () => void }) {
  const where = [lead.city, lead.postcode_prefix].filter(Boolean).join(", ");
  const title = lead.service_name && lead.city
    ? `${lead.service_name} — ${lead.city}`
    : lead.service_name || "New project";
  const dur = durationLabel(lead);
  const bothVerified = !!(lead.customer_verified && lead.customer_verified_phone);
  const rawName = lead.customer_first_name || lead.client_display_name || "";
  const clientName = rawName.trim().split(/\s+/)[0] || null;
  const thumb = (lead.inspiration_links ?? []).find((u) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u)) ?? null;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white border rounded-2xl p-5 sm:p-6 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.14)] ${
        active ? "border-[#D6A23D] ring-1 ring-[#D6A23D]/30 shadow-sm" : "border-[#E8E5DF] hover:border-[#D6A23D]/40"
      }`}
    >
      {thumb && <CardThumbnail src={thumb} />}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {lead.unlocked ? (
            <span className="text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded">Unlocked</span>
          ) : unread ? (
            <span className="text-[11px] font-bold uppercase tracking-wider bg-[#FBF1DC] text-[#9A6B14] px-2 py-1 rounded">New</span>
          ) : null}
          <FreshnessBadge createdAt={lead.created_at} />
          <LeadQualityBadge band={lead.budget_band} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          className="text-[#C9C5BB] hover:text-[#D6A23D] transition shrink-0 min-w-[44px] min-h-[44px] inline-flex items-center justify-center -mr-2 -mt-2"
          aria-label={starred ? "Unstar project" : "Star project"}
        >
          <Star className={`h-5 w-5 ${starred ? "fill-[#D6A23D] text-[#D6A23D]" : ""}`} />
        </button>
      </div>

      <h3 className="font-display text-[22px] sm:text-[26px] leading-tight text-[#1E1E1E] mb-1.5 break-words">{title}</h3>
      {clientName && (
        <div className="flex items-center gap-2 mb-3 text-[14px] text-[#3A3A3A]">
          <ServiceIcons kind={lead.kind} />
          <span className="font-medium">{clientName}</span>
        </div>
      )}


      {/* Verification */}
      <div className="mb-4">
        {bothVerified ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✔ Verified Client
          </span>
        ) : (
          <TrustBadges
            verified={lead.customer_verified}
            phoneVerified={lead.customer_verified_phone}
            showUnverified
          />
        )}
      </div>

      <div className="space-y-2 text-[15px] text-[#3A3A3A]">
        {lead.event_date && (
          <div className="flex items-center gap-2.5"><Calendar className="h-4 w-4 text-[#9A9690] shrink-0" /> <span className="font-medium">{lead.event_date}</span></div>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <MapPin className="h-4 w-4 text-[#9A9690] shrink-0" />
          <span className="font-medium">{where || "Location TBC"}</span>
          {lead.distance_miles != null && (
            <span className="text-[13px] text-[#9A6B14] bg-[#FBF1DC] border border-[#F0E0B5] rounded px-2 py-0.5 font-medium">
              {formatDistance(lead.distance_miles)}
            </span>
          )}
        </div>
        {lead.budget_band && (
          <div className="flex items-center gap-2.5"><Wallet className="h-4 w-4 text-[#9A9690] shrink-0" /> <span className="font-medium">{lead.budget_band}</span></div>
        )}
        {dur && (
          <div className="flex items-center gap-2.5"><Clock className="h-4 w-4 text-[#9A9690] shrink-0" /> <span className="font-medium">{dur}</span></div>
        )}
      </div>

      <div className="mt-4 flex items-center flex-wrap gap-2">
        <ContactedBadge
          count={lead.response_count ?? 0}
          max={lead.max_responses ?? 5}
          allowExtra={lead.allow_extra_pros}
        />
        <span className="inline-flex items-center gap-1 text-[13px] font-bold uppercase tracking-wider bg-[#FBF1DC] text-[#9A6B14] border border-[#F0E0B5] rounded px-2 py-1">
          <CoinIcon size={12} /> {lead.unlock_credit_cost ?? 8} coins
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-[#F0EDE6] flex items-center justify-between gap-2">
        <PostedAgo createdAt={lead.created_at} className="text-[13px] text-[#9A9690]" />
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
          <IconBtn label="View details" onClick={(e) => { e.stopPropagation(); onClick(); }}>
            <Eye className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={starred ? "Unsave" : "Save"} onClick={(e) => { e.stopPropagation(); onStar(); }}>
            <Bookmark className={`h-4 w-4 ${starred ? "fill-[#D6A23D] text-[#D6A23D]" : ""}`} />
          </IconBtn>
          {dismissed ? (
            <IconBtn label="Restore" onClick={(e) => { e.stopPropagation(); onUndismiss(); }}>
              <RotateCcw className="h-4 w-4" />
            </IconBtn>
          ) : (
            <IconBtn label="Not interested" onClick={(e) => { e.stopPropagation(); onDismiss(); }}>
              <ThumbsDown className="h-4 w-4" />
            </IconBtn>
          )}
        </div>
      </div>

    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="w-11 h-11 inline-flex items-center justify-center rounded-md text-[#6B6B6B] hover:text-[#1E1E1E] hover:bg-[#F4F2EC] transition"
    >
      {children}
    </button>
  );
}

function LeadDetails({
  lead, balance, busy, starred, dismissed, onStar, onDismiss, onUndismiss, onUnlock, onMessageClient, onBuyCredits, revealed, onBack, existingReport, onReported,
}: {
  lead: MarketplaceLead;
  balance: number;
  busy: boolean;
  starred: boolean;
  dismissed: boolean;
  onStar: () => void;
  onDismiss: () => void;
  onUndismiss: () => void;
  onUnlock: () => void;
  onMessageClient: () => void;
  onBuyCredits: () => void;
  revealed?: UnlockedDetails;
  onBack: () => void;
  existingReport: MyLeadReport | null;
  onReported: () => void;
}) {
  const cost = lead.unlock_credit_cost ?? 8;
  const isPremium = cost >= 10;
  const canAfford = balance >= cost;
  const where = [lead.city, lead.postcode_prefix].filter(Boolean).join(", ");
  const isUnlocked = lead.unlocked || !!revealed;
  const title = lead.service_name && lead.city
    ? `${lead.service_name} — ${lead.city}`
    : lead.service_name || "Project";

  return (
    <div className="bg-white border border-[#E8E5DF] rounded-xl overflow-hidden">
      <button onClick={onBack} className="lg:hidden flex items-center gap-1 px-5 pt-4 text-[14px] uppercase tracking-widest text-[#6B6B6B] min-h-[44px]">
        <ChevronLeft className="h-4 w-4" /> Back to list
      </button>

      {/* Header */}
      <div className="px-5 sm:px-6 pt-5 pb-5 border-b border-[#F0EDE6]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {lead.urgency_status === "urgent" && <span className="text-[14px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded">Urgent</span>}
            <UrgencyBadge urgency={lead.urgency} />
            <FreshnessBadge createdAt={lead.created_at} size="md" />
            <LeadQualityBadge band={lead.budget_band} size="md" />
            <ContactedBadge
              count={lead.response_count ?? 0}
              max={lead.max_responses ?? 5}
              allowExtra={lead.allow_extra_pros}
              size="md"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onStar}
              aria-label={starred ? "Unstar project" : "Star project"}
              className="w-11 h-11 inline-flex items-center justify-center rounded-md text-[#C9C5BB] hover:text-[#D6A23D] hover:bg-[#F4F2EC]"
            >
              <Star className={`h-5 w-5 ${starred ? "fill-[#D6A23D] text-[#D6A23D]" : ""}`} />
            </button>
          </div>
        </div>
        <h2 className="font-display text-[24px] sm:text-[32px] text-[#1E1E1E] leading-tight break-words">{title}</h2>
        <p className="text-[16px] sm:text-[18px] text-[#6B6B6B] mt-2">{lead.event_type || lead.service_name}</p>
      </div>

      {/* Key info */}
      <div className="px-5 sm:px-6 py-5 border-b border-[#F0EDE6] space-y-3">

        <InfoRow icon={<Calendar className="h-4 w-4" />} label="Date">
          {lead.event_date ?? "Flexible"}
          {lead.event_time && <span className="text-[#6B6B6B]"> · {lead.event_time}</span>}
        </InfoRow>
        {durationLabel(lead) && (
          <InfoRow icon={<Clock className="h-4 w-4" />} label="Duration">{durationLabel(lead)}</InfoRow>
        )}
        <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location">
          <span>{where || "Location TBC"}</span>
          {lead.distance_miles != null && (
            <span className="ml-2 text-[14px] text-[#9A6B14] bg-[#FBF1DC] border border-[#F0E0B5] rounded px-2 py-0.5 font-medium">
              {formatDistance(lead.distance_miles)}
            </span>
          )}
        </InfoRow>

        {lead.budget_band && (
          <InfoRow icon={<Wallet className="h-4 w-4" />} label="Budget">{lead.budget_band}</InfoRow>
        )}
        <InfoRow icon={<Clock className="h-4 w-4" />} label="Received">{relativeTime(lead.created_at)}</InfoRow>
      </div>

      {/* About */}
      <div className="px-5 sm:px-6 py-5 border-b border-[#F0EDE6]">
        <p className="text-[16px] font-medium text-[#1E1E1E] mb-3">About this project</p>
        <p className="text-[17px] text-[#1E1E1E] leading-[1.6] whitespace-pre-line">{lead.details || lead.summary}</p>
      </div>

      {/* Tags */}
      <div className="px-5 sm:px-6 py-5 border-b border-[#F0EDE6]">
        <p className="text-[16px] font-medium text-[#1E1E1E] mb-3">Client Trust</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <TrustBadges
            verified={lead.customer_verified}
            phoneVerified={lead.customer_verified_phone}
            showUnverified
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.service_name && <TagChip>{lead.service_name}</TagChip>}
          {lead.event_type && <TagChip>{lead.event_type}</TagChip>}
          {lead.customer_frequent_user && <TagChip tone="gold"><Star className="h-3.5 w-3.5" /> Frequent</TagChip>}
          {isPremium && <TagChip tone="gold"><Zap className="h-3.5 w-3.5" /> Premium</TagChip>}
        </div>
      </div>

      {/* Contact */}
      {isUnlocked ? (
        <UnlockedContactBlock
          jobId={lead.id}
          name={revealed?.customer_name ?? null}
          email={revealed?.customer_email ?? null}
          phone={revealed?.customer_phone ?? null}
          phoneVerified={revealed?.customer_verified_phone ?? lead.customer_verified_phone ?? false}
          existingReport={existingReport}
          onReported={onReported}
        />
      ) : (
        <div className="px-5 sm:px-6 py-5 border-b border-[#F0EDE6]">
          <p className="text-[16px] font-medium text-[#1E1E1E] mb-3">Contact preview</p>
          <div className="rounded-lg border border-[#E8E5DF] bg-gradient-to-br from-[#FAFAF8] to-[#F4F2EC] p-4 space-y-3">
            <div className="flex items-center gap-2.5 text-[16px]">
              <Mail className="h-4 w-4 text-[#9A6B14] shrink-0" />
              <span className="font-mono tracking-tight text-[#1E1E1E] break-all">
                {lead.masked_contact_email ?? "•••••@•••"}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-[16px]">
              <Phone className="h-4 w-4 text-[#9A6B14] shrink-0" />
              <span className="font-mono tracking-tight text-[#1E1E1E]">
                {lead.masked_contact_phone ?? "•••••"}
              </span>
            </div>
            {lead.customer_member_since && (
              <p className="text-[14px] text-[#6B6B6B] pt-2 border-t border-[#E8E5DF]">
                Member since {new Date(lead.customer_member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="flex items-start gap-2 text-[14px] text-[#6B6B6B] mt-3 leading-relaxed">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-[#9A9690]" />
            <span>Full contact details unlock for {lead.unlock_credit_cost} coins.</span>
          </div>
        </div>
      )}


      {/* Sticky actions */}
      <div className="p-5 sm:p-6 bg-[#FAFAF8]">
        {isUnlocked ? (
          <button
            onClick={onMessageClient}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#D6A23D] text-white px-5 py-3.5 min-h-[48px] rounded-lg text-[17px] font-semibold hover:bg-[#c39231] disabled:opacity-50 shadow-sm transition"
          >
            <MessageSquare className="h-5 w-5" />
            {busy ? "Opening…" : "Message client"}
          </button>
        ) : (() => {
          const respCount = lead.response_count ?? 0;
          const maxResp = lead.max_responses ?? 5;
          const isFull = respCount >= maxResp;
          const locked = isFull && !lead.allow_extra_pros;
          return (
          <>
            <div className="flex items-center justify-between mb-3 text-[16px]">
              <span className="text-[#6B6B6B]">{isPremium ? "Premium · Contact cost" : "Contact cost"}</span>
              <span className="font-semibold text-[#D6A23D] inline-flex items-center gap-1 text-[18px]"><CoinIcon size={16} />{cost} {cost === 1 ? "coin" : "coins"}</span>
            </div>
            {locked ? (
              <button
                disabled
                className="w-full inline-flex items-center justify-center gap-2 bg-[#E8E5DF] text-[#6B6B6B] px-5 py-3.5 min-h-[48px] rounded-lg text-[17px] font-semibold cursor-not-allowed"
              >
                <ShieldAlert className="h-5 w-5" />
                Project full — 5/5 pros contacted
              </button>
            ) : canAfford ? (
              <button
                onClick={onUnlock}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#D6A23D] text-white px-5 py-3.5 min-h-[48px] rounded-lg text-[17px] font-semibold hover:bg-[#c39231] disabled:opacity-50 shadow-sm transition"
              >
                <Unlock className="h-5 w-5" />
                {busy ? "Unlocking…" : isFull && lead.allow_extra_pros ? "Unlock (open to more pros)" : "Unlock & Send Proposal"}
              </button>
            ) : (
              <button
                onClick={onBuyCredits}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#1E1E1E] text-white px-5 py-3.5 min-h-[48px] rounded-lg text-[17px] font-semibold hover:bg-[#D6A23D] transition"
              >
                Buy coins to contact
              </button>
            )}
            <p className="text-[14px] text-[#6B6B6B] text-center mt-3 inline-flex items-center justify-center gap-1.5 w-full">Your balance: <CoinIcon size={14} /><b className="text-[#1E1E1E] text-[17px]">{balance}</b> {balance === 1 ? "coin" : "coins"}</p>
          </>
          );
        })()}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          <button
            onClick={onStar}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-[16px] font-medium text-[#1E1E1E] bg-white border border-[#E8E5DF] rounded-lg hover:border-[#D6A23D] transition"
          >
            <Star className={`h-4 w-4 ${starred ? "fill-[#D6A23D] text-[#D6A23D]" : ""}`} />
            {starred ? "Saved" : "Save project"}
          </button>
          <button
            onClick={onBack}
            className="lg:hidden inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-[16px] font-medium text-[#1E1E1E] bg-white border border-[#E8E5DF] rounded-lg hover:border-[#D6A23D] transition"
          >
            <ChevronLeft className="h-4 w-4" /> Back to list
          </button>
          {dismissed ? (
            <button
              onClick={onUndismiss}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-[16px] font-medium text-[#1E1E1E] bg-white border border-[#E8E5DF] rounded-lg hover:border-[#D6A23D] transition"
            >
              <RotateCcw className="h-4 w-4" /> Restore project
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-[16px] font-medium text-[#1E1E1E] bg-white border border-[#E8E5DF] rounded-lg hover:border-red-300 hover:text-red-700 transition"
            >
              <ThumbsDown className="h-4 w-4" /> Not interested
            </button>
          )}
          <button
            onClick={onBuyCredits}
            className="hidden lg:inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-[16px] font-medium text-[#1E1E1E] bg-white border border-[#E8E5DF] rounded-lg hover:border-[#D6A23D] transition"
          >
            <Plus className="h-4 w-4" /> Buy coins
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start sm:items-center gap-3 flex-wrap sm:flex-nowrap">
      <span className="text-[#9A9690] shrink-0">{icon}</span>
      <span className="text-[#6B6B6B] text-[15px] sm:text-[16px] sm:w-24 shrink-0">{label}</span>
      <span className="text-[#1E1E1E] text-[17px] sm:text-[18px] font-medium break-words min-w-0">{children}</span>
    </div>
  );

}

function TagChip({ children, tone }: { children: React.ReactNode; tone?: "gold" | "emerald" }) {
  const cls =
    tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "gold" ? "bg-[#FBF1DC] text-[#9A6B14] border-[#E8D49A]"
    : "bg-[#F4F2EC] text-[#1E1E1E] border-[#E8E5DF]";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[14px] border rounded-md ${cls}`}>
      {children}
    </span>
  );
}

function UnlockedContactBlock({ jobId, name, email, phone, phoneVerified, existingReport, onReported }: {
  jobId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  phoneVerified?: boolean;
  existingReport: MyLeadReport | null;
  onReported: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  const statusLabel = existingReport
    ? existingReport.status === "pending"
      ? "Refund Request Submitted — Pending Review"
      : existingReport.status === "approved"
        ? "Refund Approved — Credits Refunded"
        : "Refund Request Rejected"
    : null;
  const statusCls = existingReport?.status === "approved"
    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : existingReport?.status === "rejected"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-amber-50 border-amber-200 text-amber-900";

  return (
    <div className="px-5 sm:px-6 py-5 border-b border-[#F0EDE6]">
      <p className="text-[16px] font-medium text-[#1E1E1E] mb-3">Contact</p>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-[#FBF1DC] text-[#9A6B14] inline-flex items-center justify-center font-display text-[18px] shrink-0">
          {(name ?? "C").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[17px] font-semibold text-[#1E1E1E] flex items-center gap-2 flex-wrap">
            <span>{name ?? "—"}</span>
            {phoneVerified && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                ✅ Mobile verified
              </span>
            )}
          </p>

          {email && (
            <div className="flex items-center gap-2 flex-wrap">
              <a href={`mailto:${email}`} className="text-[16px] text-[#1E1E1E] hover:text-[#D6A23D] inline-flex items-center gap-2 break-all flex-1 min-w-0">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="break-all">{email}</span>
              </a>
              <button
                type="button"
                onClick={() => copy(email, "Email")}
                className="text-[14px] inline-flex items-center gap-1 px-3 py-2 min-h-[44px] rounded border border-[#E8E5DF] text-[#6B6B6B] hover:bg-[#FAFAF8]"
                aria-label="Copy email"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          )}

          {phone && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`tel:${phone}`} className="text-[16px] text-[#1E1E1E] hover:text-[#D6A23D] inline-flex items-center gap-2 flex-1 min-w-0">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span className="truncate">{phone}</span>
                </a>
                <a
                  href={`tel:${phone}`}
                  className="text-[14px] inline-flex items-center gap-1 px-3 py-2 min-h-[44px] rounded border border-[#E8E5DF] text-[#6B6B6B] hover:bg-[#FAFAF8]"
                >
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
                <button
                  type="button"
                  onClick={() => copy(phone, "Phone number")}
                  className="text-[14px] inline-flex items-center gap-1 px-3 py-2 min-h-[44px] rounded border border-[#E8E5DF] text-[#6B6B6B] hover:bg-[#FAFAF8]"
                  aria-label="Copy phone number"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>

              {existingReport ? (
                <div className={`flex items-center justify-between gap-2 px-3 py-2.5 border rounded-md text-[14px] flex-wrap ${statusCls}`}>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Flag className="h-3.5 w-3.5" /> {statusLabel}
                  </span>
                  <Link to="/pro/refunds" className="underline underline-offset-2 hover:no-underline whitespace-nowrap">
                    View Refund Request →
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] rounded-md border border-red-200 bg-red-50 text-red-700 text-[15px] font-semibold hover:bg-red-100 transition-colors"
                >
                  <Flag className="h-4 w-4" /> Report Invalid Number
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ReportInvalidNumberModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        jobId={jobId}
        onSubmitted={onReported}
      />
    </div>
  );
}
