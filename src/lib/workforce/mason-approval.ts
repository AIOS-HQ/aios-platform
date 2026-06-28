export function masonFounderApproved(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true" || value === "approved";
}
