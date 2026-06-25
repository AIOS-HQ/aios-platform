import { redirect } from "next/navigation";

/**
 * Life Advisor has been folded into the one Harmony experience as the
 * "Suggestions" tab. Kept as a redirect for backward-compatible links.
 */
export default function AdvisorRedirect() {
  redirect("/harmony/operator?tab=suggestions");
}
