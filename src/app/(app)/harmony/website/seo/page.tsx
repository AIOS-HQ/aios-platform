import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website SEO" };

export default function WebsiteSeoPage() {
  return <WebsiteOperationsSubPage title="SEO" focus="Sitemap and robots must list public routes only and exclude protected Harmony/settings/API routes." snapshot={getWebsiteOperationsSnapshot()} />;
}
