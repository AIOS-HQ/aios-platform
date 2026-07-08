import type { MetadataRoute } from "next";

const PUBLIC_ROUTES = [
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
] as const;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://aios-platform-omega.vercel.app").replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.8,
  }));
}
