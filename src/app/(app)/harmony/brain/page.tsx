import { redirect } from "next/navigation";

/**
 * Personal Brain has been folded into the one Harmony experience as the
 * "Memory" tab. Kept as a redirect for backward-compatible links.
 */
export default function BrainRedirect() {
  redirect("/harmony/operator?tab=memory");
}
