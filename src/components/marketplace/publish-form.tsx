"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MARKETPLACE_ITEM_KINDS } from "@/lib/marketplace/types";
import { publishMarketplaceItem } from "@/lib/marketplace/publish-actions";

function humanize(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Publish form — create a marketplace item + first version. Publishes to the
 * author's private company catalog as unverified (server-enforced by RLS); AIOS
 * verifies before public listing. Uses a native select for the type to stay
 * dependency-light.
 */
export function PublishForm({ companyId }: { companyId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>("skill");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [changelog, setChangelog] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const canSubmit = name.trim() !== "" && effectiveSlug !== "" && !pending;

  function submit() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await publishMarketplaceItem({
        kind,
        name,
        slug: effectiveSlug,
        description,
        version,
        changelog,
        companyId,
      });
      if (res.ok) {
        toast.success("Published to your private catalog — submit for verification to list publicly.");
        router.push("/harmony/marketplace");
        router.refresh();
      } else {
        setError(res.error ?? "Could not publish.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-2xl flex-col gap-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-kind">Type</Label>
          <select
            id="mp-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {MARKETPLACE_ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mp-version">Version</Label>
          <Input id="mp-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mp-name">Name</Label>
        <Input
          id="mp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Revenue Ops Autopilot"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mp-slug">Slug</Label>
        <Input
          id="mp-slug"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="revenue-ops-autopilot"
        />
        <p className="text-xs text-muted-foreground">Lowercase, hyphenated — auto-derived from the name.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mp-desc">Description</Label>
        <Textarea
          id="mp-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What it does and who it's for."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mp-changelog">Changelog (first version)</Label>
        <Textarea
          id="mp-changelog"
          value={changelog}
          onChange={(e) => setChangelog(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Initial release."
        />
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        New items publish to your <span className="font-medium text-foreground">private company catalog</span> as{" "}
        <span className="font-medium text-foreground">unverified</span>. AIOS verifies items before they can be listed on
        the public marketplace.
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-4" aria-hidden="true" />
          )}
          Publish
        </Button>
      </div>
    </form>
  );
}
