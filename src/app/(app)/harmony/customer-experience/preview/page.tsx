import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Eye, ListTodo, ShieldCheck, Sparkles, Target } from "lucide-react";
import { SUBSCRIBER_HARMONY_ROUTES } from "@/lib/customer-experience/routes";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Subscriber Harmony Preview",
};

export default function SubscriberHarmonyPreviewPage() {
  return (
    <>
      <PageHeader
        title="Subscriber Harmony preview"
        description="Synthetic, non-destructive preview of the customer product. This does not impersonate a real customer or expose private customer records."
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/">Preview public website</Link>
        </Button>
      </PageHeader>

      <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Preview mode</Badge>
          <Badge variant="outline">Synthetic workspace</Badge>
          <Badge variant="outline">External actions disabled</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          The cards below model first-login, empty-state, dashboard, operator, tasks, goals, notes, integrations,
          approvals, and settings behavior without mutating live subscriber data.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              First login
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
            <PreviewStep icon={Eye} title="Welcome" body="Harmony introduces the private operating system and guides setup." />
            <PreviewStep icon={ListTodo} title="First task" body="Customer can create a private task from the dashboard or operator." />
            <PreviewStep icon={Target} title="First goal" body="Goals and notes remain owner-scoped and never surface in Founder KPI cards." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="size-4 text-destructive" />
              Disabled in preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>No messages are sent.</p>
            <p>No emails, social posts, or connector actions run.</p>
            <p>No real customer records are read or modified.</p>
            <p>Destructive controls are omitted from preview mode.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {SUBSCRIBER_HARMONY_ROUTES.map((route) => (
          <Card key={route.route}>
            <CardContent className="p-4">
              <p className="font-mono text-xs text-muted-foreground">{route.route}</p>
              <p className="mt-2 text-sm font-semibold">{route.purpose}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{route.privacy}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Security boundary</p>
            <p className="text-sm text-muted-foreground">
              Preview mode is a Founder OS visualization. Real Subscriber Harmony routes still use Supabase auth and RLS.
            </p>
          </div>
          <ShieldCheck className="size-5 text-primary" />
        </CardContent>
      </Card>
    </>
  );
}

function PreviewStep({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <Icon className="size-5 text-primary" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
