import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Releases" };

export default function WebsiteReleasesPage() {
  return <WebsiteOperationsSubPage title="Releases" focus="Website release evidence comes from PR, CI, Vercel preview, and Founder visual acceptance." snapshot={getWebsiteOperationsSnapshot()} />;
}
