// Guards user-entered or scraped URLs before they become an href: only http(s) is allowed, so a
// value like "javascript:alert(1)" is never turned into a clickable link.
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}
