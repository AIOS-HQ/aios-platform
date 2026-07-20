import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Visitors" };

export default function WebsiteVisitorsPage() {
  return <WebsiteOperationsSubPage title="Visitors" focus="Visitor counts are not shown until a real analytics source is configured." snapshot={getWebsiteOperationsSnapshot()} />;
}
