"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { CustomHtmlData } from "@/lib/blocks/schema";
import {
  buildCustomHtmlDocument,
  CUSTOM_HTML_MAX_HEIGHT,
  CUSTOM_HTML_MIN_HEIGHT,
  isCustomHtmlHeightMessage,
} from "@/lib/blocks/custom-html";

export function CustomHtmlBlock({ data }: { data: CustomHtmlData }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reactId = useId();
  const bridgeId = useMemo(
    () => `custom-html-${reactId.replace(/:/g, "")}`,
    [reactId]
  );
  const fixedHeight = Math.min(
    CUSTOM_HTML_MAX_HEIGHT,
    Math.max(CUSTOM_HTML_MIN_HEIGHT, data.height ?? 500)
  );
  const [height, setHeight] = useState(fixedHeight);
  const srcDoc = useMemo(
    () =>
      buildCustomHtmlDocument({
        html: data.html,
        baseUrl: data.baseUrl,
        bridgeId,
      }),
    [bridgeId, data.baseUrl, data.html]
  );

  useEffect(() => {
    setHeight(fixedHeight);
  }, [fixedHeight, srcDoc]);

  useEffect(() => {
    if (!data.autoHeight || !data.allowScripts) return;

    function handleMessage(event: MessageEvent) {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        !isCustomHtmlHeightMessage(event.data) ||
        event.data.id !== bridgeId
      ) {
        return;
      }

      setHeight(
        Math.min(
          CUSTOM_HTML_MAX_HEIGHT,
          Math.max(CUSTOM_HTML_MIN_HEIGHT, Math.ceil(event.data.height))
        )
      );
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [bridgeId, data.allowScripts, data.autoHeight]);

  const sandbox = [
    data.allowScripts ? "allow-scripts" : "",
    data.allowForms ? "allow-forms" : "",
    data.allowModals ? "allow-modals" : "",
    data.allowPopups ? "allow-popups allow-popups-to-escape-sandbox" : "",
    data.allowDownloads ? "allow-downloads" : "",
    data.allowPresentation ? "allow-presentation" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <iframe
      ref={iframeRef}
      title={data.name || "Custom HTML"}
      srcDoc={srcDoc}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      className="block w-full border-0 bg-white"
      style={{ height: data.autoHeight ? height : fixedHeight }}
    />
  );
}
