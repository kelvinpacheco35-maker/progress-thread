export const PUBLISHED_APP_ORIGIN = "https://progress-thread.lovable.app";

export function needsPublishedAuthHost(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;
  if (hostname === new URL(PUBLISHED_APP_ORIGIN).hostname) return false;
  return hostname.endsWith(".lovableproject.com") || hostname.startsWith("id-preview--") || hostname.includes("-preview--");
}

export function redirectToPublishedAuthHost() {
  if (typeof window === "undefined") return false;
  if (!needsPublishedAuthHost(window.location.hostname)) return false;

  const target = new URL(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    PUBLISHED_APP_ORIGIN,
  );
  window.location.replace(target.toString());
  return true;
}