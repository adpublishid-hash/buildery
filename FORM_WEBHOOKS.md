# Form Webhooks

When a form has a webhook URL, every new submission is POSTed to it as JSON.

## Request

```
POST <your webhook URL>
Content-Type: application/json
User-Agent: MyLanding-Webhook/1.0
X-Buildery-Timestamp: 1757671200
X-Buildery-Signature: sha256=<hex>
```

```json
{
  "event": "form.submission.created",
  "submission": {
    "id": "clx…",
    "formId": "clx…",
    "formTitle": "Kontak",
    "formSlug": "kontak",
    "workspaceId": "clx…",
    "workspaceName": "Toko",
    "createdAt": "2026-09-12T10:00:00.000Z",
    "data": { "email": "budi@contoh.id", "pesan": "halo" },
    "ipAddress": "203.0.113.9",
    "userAgent": "Mozilla/5.0 …",
    "referrer": "https://toko.test/forms/kontak"
  }
}
```

Redirects are **not** followed — point the form at the final URL. A 3xx
response is recorded as a failed delivery.

## Verifying the signature

The signature is an HMAC-SHA256 over `"<timestamp>.<raw body>"`, keyed by a
per-workspace key derived from the server's signing secret. Verify against the
**raw request body**, before any JSON parsing — re-serialising changes the
bytes and the signature will not match.

```js
const crypto = require("node:crypto");

function verify(rawBody, headers, secret, workspaceId) {
  const timestamp = headers["x-buildery-timestamp"];
  const signature = (headers["x-buildery-signature"] || "").replace(/^sha256=/, "");
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes, so a captured delivery cannot
  // be replayed later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = crypto
    .createHmac("sha256", secret)
    .update(`workspace:${workspaceId}`)
    .digest();
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

`secret` is the server's `WEBHOOK_SIGNING_SECRET`, or `NEXTAUTH_SECRET` when
that is not set. `workspaceId` is the one carried in the payload — deriving
the key per workspace means one tenant's secret cannot be used to forge
another's deliveries.

## Retries

A failed delivery is retried automatically by the `FORM_DELIVERY_RETRY` job
with exponential backoff (2, 4, 8, … minutes, capped at an hour), up to five
attempts. After that the row stays visible as a permanent failure in the
submissions list, where it can still be retried by hand.

Deliveries are **at least once**: a receiver that times out after having
already processed the payload will see it again. Deduplicate on
`submission.id`.
