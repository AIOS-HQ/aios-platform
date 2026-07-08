import type { MetadataRoute } from "next";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://aios-platform-omega.vercel.app").replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/features",
        "/marketplace",
        "/ai-workforce",
        "/templates",
        "/docs",
        "/pricing",
        "/faq",
        "/help",
        "/privacy",
        "/terms",
        "/login",
        "/signup",
      ],
      disallow: ["/harmony", "/settings", "/api"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
