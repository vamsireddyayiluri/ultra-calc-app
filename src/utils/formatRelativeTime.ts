// src/utils/formatRelativeTime.ts
//
// Single shared relative-time formatter. Extracted from
// ProjectStatusCard.tsx so the dashboard's "Last Updated"/"Last Saved"
// metadata and the in-editor status card never drift into two different
// phrasings for the same kind of value.

export function formatRelativeTime(at: number | null | undefined): string {
  if (at == null) return "Never";
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString();
}

export function formatAbsoluteDate(at: number | null | undefined): string {
  if (at == null) return "Unknown";
  return new Date(at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
