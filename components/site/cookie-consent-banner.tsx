"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resetPageViewTracking } from "@/components/site/site-page-view-tracker";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  type AdConsent,
} from "@/lib/analytics-visitor";

/**
 * Asks before any advertising or analytics tag (Meta, TikTok, Google) loads.
 * Shown only when the store requires consent and the visitor has not answered.
 * The answer is a first-party cookie the server reads too, so declining also
 * stops the server-side copies of events.
 */
export function CookieConsentBanner({ storeName }: { storeName: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Decided client-side so a cached page never shows a stale banner.
    setVisible(!document.cookie.split("; ").some((c) => c.startsWith(`${CONSENT_COOKIE}=`)));
  }, []);

  function answer(value: AdConsent) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    setVisible(false);
    if (value === "granted") {
      // Re-render the layout with the tags, and count the page they missed.
      resetPageViewTracking();
      router.refresh();
    }
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Persetujuan cookie"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg sm:inset-x-4 sm:bottom-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
            <Cookie className="h-4 w-4" />
          </span>
          <p className="text-xs leading-5 text-zinc-600">
            {storeName} memakai cookie untuk mengukur iklan dan kunjungan (Meta,
            TikTok, Google). Keranjang dan checkout tetap berjalan tanpa cookie
            ini.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => answer("denied")}>
            Tolak
          </Button>
          <Button type="button" size="sm" onClick={() => answer("granted")}>
            Terima
          </Button>
        </div>
      </div>
    </div>
  );
}
