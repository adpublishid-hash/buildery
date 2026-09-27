"use client";

import { useEffect } from "react";

const RELOAD_KEY = "buildery:chunk-reload-attempted";

function isChunkLoadError(value: unknown) {
  if (!value || typeof value !== "object") return false;

  const maybeError = value as { message?: unknown; name?: unknown };
  const message =
    typeof maybeError.message === "string" ? maybeError.message : "";
  const name = typeof maybeError.name === "string" ? maybeError.name : "";

  return (
    name === "ChunkLoadError" ||
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

export function ChunkReloadGuard() {
  useEffect(() => {
    function reloadOnce() {
      if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        reloadOnce();
      }
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason)) {
        reloadOnce();
      }
    }

    function onPageShow() {
      sessionStorage.removeItem(RELOAD_KEY);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
