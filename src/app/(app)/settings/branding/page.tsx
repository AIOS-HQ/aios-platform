import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";
import { listCompanies } from "@/lib/data/os/companies";
import { getEnvelope } from "@/lib/company/envelope/data-access";
import { getDownloadUrl } from "@/lib/uploads/storage";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadButton } from "@/components/uploads/upload-button";
import { CompanyBrandingForm } from "@/components/uploads/company-branding-form";

export const metadata: Metadata = { title: "Branding & Profile · AIOS" };

/**
 * Founder Experience (P6) — Branding & Profile. Founder profile photo + company
 * logo/banner uploads on the owner-scoped Storage bucket. Enterprise-polished.
 */
export default async function BrandingPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const companies = await listCompanies();
  const company = companies[0] ?? null;
  const envelope = company ? await getEnvelope(company.id) : null;
  const profilePhotoUrl = profile?.profile_photo_path
    ? await getDownloadUrl(profile.profile_photo_path, 3600)
    : null;
  const companyLogoPath = envelope?.brand.logo ?? null;
  const companyBannerPath = envelope?.brand.banner ?? null;
  const [companyLogoUrl, companyBannerUrl] = await Promise.all([
    companyLogoPath ? getDownloadUrl(companyLogoPath, 3600) : Promise.resolve(null),
    companyBannerPath ? getDownloadUrl(companyBannerPath, 3600) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Branding & Profile"
        description="Upload your profile photo and company branding — logo and banner."
      />
      <div className="flex flex-col gap-6 lg:max-w-2xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Founder profile</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadButton
              category="profile"
              label="Profile photo"
              accept="image/jpeg,image/png,image/webp,image/gif"
              initialPreview={profilePhotoUrl}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {company ? (
              <CompanyBrandingForm
                companyId={company.id}
                companyName={company.name}
                initialLogoPath={companyLogoPath}
                initialLogoUrl={companyLogoUrl}
                initialBannerPath={companyBannerPath}
                initialBannerUrl={companyBannerUrl}
              />
            ) : (
              <p className="rounded-lg border bg-muted/35 p-4 text-sm text-muted-foreground">
                Create or connect a company before saving company logo and banner assets.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
