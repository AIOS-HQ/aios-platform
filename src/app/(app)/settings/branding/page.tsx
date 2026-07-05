import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/user";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadButton } from "@/components/uploads/upload-button";

export const metadata: Metadata = { title: "Branding & Profile · AIOS" };

/**
 * Founder Experience (P6) — Branding & Profile. Founder profile photo + company
 * logo/banner uploads on the owner-scoped Storage bucket. Enterprise-polished.
 */
export default async function BrandingPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Branding & Profile" description="Upload your profile photo and company branding — logo and banner." />
      <div className="flex flex-col gap-6 lg:max-w-2xl">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Founder profile</CardTitle></CardHeader>
          <CardContent>
            <UploadButton category="profile" label="Profile photo" accept="image/*" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Company branding</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <UploadButton category="company-logo" label="Company logo" accept="image/*" />
            <UploadButton category="company-banner" label="Company banner" accept="image/*" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
