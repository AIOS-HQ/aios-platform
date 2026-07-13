import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Subscriber Journey" };

const STEPS = [
  ["Visitor", "Public website explains AIOS and routes to pricing, docs, login, or signup."],
  ["Signup", "Supabase Auth creates the account; profile and settings rows are provisioned by database trigger."],
  ["First login", "Customer enters protected Subscriber Harmony, not Founder OS."],
  ["Onboarding", "Guided setup introduces Harmony and recommended next actions. Durable completion tracking is still a follow-up."],
  ["Activation", "First task, goal, note, profile photo, or integration connection becomes durable activation evidence."],
  ["Engagement", "Harmony operator, dashboard, tasks, goals, notes, memory, learning, activity, approvals, and connections serve daily use."],
  ["Support", "Founder sees aggregate health and authorized support workflows without private content exposure."],
];

export default function CustomerExperienceJourneyPage() {
  return (
    <>
      <PageHeader title="User Journey" description="Visitor-to-subscriber lifecycle and data boundaries." />
      <div className="grid gap-3">
        {STEPS.map(([title, body], index) => (
          <Card key={title}>
            <CardContent className="flex gap-4 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
              {index < STEPS.length - 1 ? <ArrowRight className="ml-auto hidden size-4 text-muted-foreground sm:block" /> : <CheckCircle2 className="ml-auto hidden size-4 text-success sm:block" />}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
