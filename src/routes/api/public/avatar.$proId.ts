import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/avatar/$proId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const proId = params.proId;
        if (!proId) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pro } = await supabaseAdmin
          .from("professionals")
          .select("avatar_path")
          .eq("id", proId)
          .maybeSingle();
        if (!pro?.avatar_path) return new Response("Not found", { status: 404 });
        const { data: signed } = await supabaseAdmin.storage
          .from("professional-avatars")
          .createSignedUrl(pro.avatar_path, 3600);
        if (!signed?.signedUrl) return new Response("Not found", { status: 404 });
        return new Response(null, {
          status: 302,
          headers: {
            Location: signed.signedUrl,
            "Cache-Control": "public, max-age=600",
          },
        });
      },
    },
  },
});
