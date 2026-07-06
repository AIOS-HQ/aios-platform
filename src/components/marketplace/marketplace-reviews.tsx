"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/lib/marketplace/review-actions";

export interface ReviewItem {
  stars: number;
  comment: string;
}

/**
 * Marketplace reviews — shows existing written reviews for an item and lets the
 * signed-in user leave/update their own (star rating + optional comment) via the
 * submitReview server action. On success the page revalidates so the new review
 * and the item's average rating refresh. Replaces the old screenshots
 * placeholder with real, functional social proof.
 */
export function MarketplaceReviews({
  itemId,
  initialReviews,
}: {
  itemId: string;
  initialReviews: ReviewItem[];
}) {
  const router = useRouter();
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await submitReview(itemId, stars, comment);
      if (res.ok) {
        setDone(true);
        setComment("");
        router.refresh();
      } else {
        setError(res.error ?? "Could not submit review");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-foreground/80">Reviews</p>

      {initialReviews.length === 0 ? (
        <p className="text-muted-foreground">No reviews yet — be the first.</p>
      ) : (
        <ul className="space-y-1.5">
          {initialReviews.map((r, i) => (
            <li key={i} className="rounded-md border bg-background p-2">
              <span
                className="flex items-center gap-0.5 text-amber-500"
                aria-label={`${r.stars} out of 5 stars`}
              >
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star
                    key={j}
                    className={cn("size-3", j < r.stars ? "fill-current" : "text-muted-foreground/30")}
                    aria-hidden="true"
                  />
                ))}
              </span>
              {r.comment ? <p className="mt-1 text-muted-foreground">{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 flex flex-col gap-1.5 rounded-md border bg-background p-2">
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Your rating">
          {Array.from({ length: 5 }).map((_, i) => {
            const val = i + 1;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setStars(val)}
                aria-label={`${val} star${val > 1 ? "s" : ""}`}
                aria-pressed={stars === val}
                className="p-0.5"
              >
                <Star
                  className={cn(
                    "size-4 transition-colors",
                    val <= stars ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Share your experience (optional)"
          aria-label="Your review"
          className="text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          {error ? (
            <span className="text-[11px] text-destructive">{error}</span>
          ) : done ? (
            <span className="text-[11px] text-success">Thanks for your review</span>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" className="h-7" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            Submit review
          </Button>
        </div>
      </div>
    </div>
  );
}
