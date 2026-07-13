import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Performance" };

export default function WebsitePerformancePage() {
  return <WebsiteOperationsSubPage title="Performance" focus="Production build and Vercel deployment evidence are the current performance gates; no fake latency metrics are shown." snapshot={getWebsiteOperationsSnapshot()} />;
}
