import type { Metadata } from "next";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { WebsiteOperationsSubPage } from "../sub-page";

export const metadata: Metadata = { title: "Website Feedback" };

export default function WebsiteFeedbackPage() {
  return <WebsiteOperationsSubPage title="Feedback" focus="Public feedback needs an approved support/CRM path before reporting volume or sentiment." snapshot={getWebsiteOperationsSnapshot()} />;
}
