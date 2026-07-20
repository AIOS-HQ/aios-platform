import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Content" };

export default function WebsiteContentPage() {
  return <WebsiteOperationsSubPage title="Content" focus="Public copy must stay aligned with implemented AIOS, Harmony, Julius, workforce, and integration capabilities." snapshot={getWebsiteOperationsSnapshot()} />;
}
