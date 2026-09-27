/**
 * Sends an error caught by a client error boundary to /api/errors, which
 * records it for /admin/errors. Best effort: it must never throw inside a
 * boundary that is already handling a crash.
 */
export function reportClientError(
  boundary: "root" | "global" | "dashboard",
  error: Error & { digest?: string }
) {
  try {
    const payload = JSON.stringify({
      boundary,
      message: error.message,
      digest: error.digest,
      path: window.location.pathname,
    });
    const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon?.("/api/errors", blob)) return;
    void fetch("/api/errors", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting is best effort.
  }
}
