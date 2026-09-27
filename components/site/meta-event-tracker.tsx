"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { trackMetaEvent, type BrowserAdIdentity } from "@/lib/meta-client";
import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";

type Props = {
  workspaceId: string;
  eventName: MetaStandardEventName;
  customData?: MetaCustomData;
  eventId?: string;
  dedupeKey?: string;
  sendServer?: boolean;
  serverToken?: string;
  identity?: BrowserAdIdentity;
};

const tracked = new Set<string>();

export function MetaEventTracker({
  workspaceId,
  eventName,
  customData,
  eventId,
  dedupeKey,
  sendServer = true,
  serverToken,
  identity,
}: Props) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const path = search ? `${pathname}?${search}` : pathname;
  const dataKey = useMemo(
    () => JSON.stringify(customData ?? {}),
    [customData]
  );

  useEffect(() => {
    const key = `${workspaceId}:${eventName}:${dedupeKey ?? eventId ?? path}`;
    if (tracked.has(key)) return;
    tracked.add(key);

    trackMetaEvent({
      workspaceId,
      eventName,
      customData,
      eventId,
      sendServer,
      serverToken,
      identity,
    });
  }, [
    workspaceId,
    eventName,
    eventId,
    sendServer,
    serverToken,
    dedupeKey,
    path,
    dataKey,
    customData,
    identity,
  ]);

  return null;
}
