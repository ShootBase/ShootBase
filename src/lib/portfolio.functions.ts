import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyPortfolioItem = {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
  created_at: string;
};

export type MyPortfolioResponse = {
  items: MyPortfolioItem[];
  total: number;
  max_items: number;
  has_subscription: boolean;
};

export const getMyPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPortfolioResponse> => {
    const { data, error } = await context.supabase.rpc("my_portfolio" as never);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<MyPortfolioItem & { total: number; max_items: number; has_subscription: boolean }>;
    if (rows.length === 0) {
      // Still want to read caps even when empty — query helper directly
      const { data: pro } = await context.supabase.from("professionals").select("id").eq("user_id", context.userId).maybeSingle();
      if (!pro) return { items: [], total: 0, max_items: 10, has_subscription: false };
      const { data: sub } = await context.supabase.rpc("pro_has_active_subscription" as never, { _pro_id: pro.id } as never);
      const has = !!sub;
      return { items: [], total: 0, max_items: has ? 20 : 10, has_subscription: has };
    }
    return {
      items: rows.map((r) => ({
        id: r.id, image_url: r.image_url, caption: r.caption,
        display_order: r.display_order, created_at: r.created_at,
      })),
      total: rows[0].total,
      max_items: rows[0].max_items,
      has_subscription: rows[0].has_subscription,
    };
  });

export const addPortfolioImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    image_url: z.string().min(1).max(500),
    caption: z.string().max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("add_portfolio_item" as never, {
      _image_url: data.image_url,
      _caption: data.caption ?? null,
    } as never);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("portfolio_limit_reached")) {
        return { ok: false as const, error: "LIMIT_REACHED" as const };
      }
      throw new Error(msg);
    }
    return { ok: true as const, id: id as unknown as string };
  });

export const reorderPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ordered_ids: z.array(z.string().uuid()).min(1).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reorder_portfolio" as never, {
      _ordered_ids: data.ordered_ids,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
