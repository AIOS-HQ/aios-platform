import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Analytics" };

export default function WebsiteAnalyticsPage() {
  return <WebsiteOperationsSubPage title="Analytics" focus="Visitor and page-view analytics require a configured analytics provider." snapshot={getWebsiteOperationsSnapshot()} />;
}
