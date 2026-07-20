import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Conversions" };

export default function WebsiteConversionsPage() {
  return <WebsiteOperationsSubPage title="Conversions" focus="Pricing, signup, and waitlist conversion rates are configuration-gated until events are persisted." snapshot={getWebsiteOperationsSnapshot()} />;
}
