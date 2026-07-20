import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Reliability" };

export default function WebsiteReliabilityPage() {
  return <WebsiteOperationsSubPage title="Reliability" focus="Reliability should use Vercel/Supabase/Event Mesh evidence when configured; no uptime percentage is fabricated." snapshot={getWebsiteOperationsSnapshot()} />;
}
