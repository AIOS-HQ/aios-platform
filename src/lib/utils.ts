import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and resolve Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sanitize a free-text search term for safe use in a PostgREST ilike filter. */
export function sanitizeSearch(input: string): string {
  return input
    .trim()
    .replace(/[,%()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Derive up-to-two-letter initials from a name or email for avatars. */
export function getInitials(nameOrEmail: string): string {
  const value = (nameOrEmail || "").trim();
  if (!value) return "U";
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return value.slice(0, 2).toUpperCase();
}
