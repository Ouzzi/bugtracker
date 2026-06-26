import type { MouseEvent } from "react";

/** Decode a `data:` URL into a Blob (handles base64 and percent-encoded payloads). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(5, comma); // strip leading "data:"
  const base64 = /;base64$/i.test(header);
  const mime = header.replace(/;base64$/i, "") || "application/octet-stream";
  const data = dataUrl.slice(comma + 1);
  if (!base64) return new Blob([decodeURIComponent(data)], { type: mime });
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Open a screenshot full-size from the triage card. Browsers block top-level
 * navigation to `data:` URLs (a common shape when an upload adapter inlines images
 * as base64), which yields a blank tab. Convert those to a Blob URL — which
 * browsers do allow to open — synchronously so the popup stays attributed to the
 * user's click. `http(s)` and `blob:` URLs navigate normally via the anchor.
 */
export function openScreenshot(e: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!url) {
    e.preventDefault();
    return;
  }
  if (!url.startsWith("data:")) return;
  e.preventDefault();
  try {
    const blobUrl = URL.createObjectURL(dataUrlToBlob(url));
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    // Revoke once the new tab has had time to load the image.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    // Conversion failed — leave the click inert rather than navigating to data:.
  }
}
