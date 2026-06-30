import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// TODO: replace with your project URL once a project name or custom domain is set.
const BASE_URL = "";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/browse", changefreq: "daily", priority: "0.9" },
          { path: "/auth", changefreq: "monthly", priority: "0.3" },
          { path: "/legal/privacy", changefreq: "yearly", priority: "0.2" },
          { path: "/legal/terms", changefreq: "yearly", priority: "0.2" },
          { path: "/legal/cookies", changefreq: "yearly", priority: "0.2" },
          { path: "/legal/gdpr", changefreq: "yearly", priority: "0.2" },
          { path: "/legal/photographer-terms", changefreq: "yearly", priority: "0.2" },
          { path: "/legal/customer-terms", changefreq: "yearly", priority: "0.2" },
        ];
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...entries.map(
            (e) =>
              `  <url><loc>${BASE_URL}${e.path}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
          ),
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
