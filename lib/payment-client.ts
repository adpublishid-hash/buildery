// Client-side helper to kick off a Midtrans payment. Safe to import from
// "use client" components (no server-only imports).

export type StartPaymentResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Calls the create-transaction API for a PENDING payment and returns the
 * URL the browser should navigate to (Midtrans Snap, or the local status
 * page in sandbox-free mode).
 */
export async function startPayment(
  paymentId: string,
  accessToken: string
): Promise<StartPaymentResult> {
  try {
    const res = await fetch("/api/payments/midtrans/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId, accessToken }),
    });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      return { ok: false, error: json.error ?? "Could not start payment." };
    }
    return { ok: true, url: json.url };
  } catch {
    return { ok: false, error: "Network error while starting payment." };
  }
}
