const MAX_DIM = 1600;

// Captures the current page as a downscaled JPEG blob. html-to-image renders via
// the browser (so modern CSS such as oklch colors work). Any element marked with
// `data-bug-widget="true"` is excluded so the reporter UI never appears in the
// shot. Best-effort: returns null on failure and the report is still submittable
// without an image.
export async function capturePage(): Promise<Blob | null> {
  try {
    const { toCanvas } = await import("html-to-image");
    // JPEG has no alpha, so fill transparent areas with the page background
    // (body carries it; falls back to white).
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const backgroundColor =
      bodyBg && bodyBg !== "transparent" && bodyBg !== "rgba(0, 0, 0, 0)"
        ? bodyBg
        : "#ffffff";
    const canvas = await toCanvas(document.body, {
      backgroundColor,
      pixelRatio: 1,
      // cacheBust appends a query param to images, which breaks CORS on some
      // CDN assets; skipFonts avoids cross-origin @font-face fetches. Both
      // otherwise make the whole capture reject and the report get no screenshot.
      cacheBust: false,
      skipFonts: true,
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.bugWidget === "true") return false;
        // Skip cross-origin images: inlining them can fail (CORS) and abort the
        // whole capture — better to leave them blank than to lose the shot.
        if (node instanceof HTMLImageElement) {
          try {
            return new URL(node.src, location.href).origin === location.origin;
          } catch {
            return false;
          }
        }
        return true;
      },
    });

    const scale = Math.min(1, MAX_DIM / Math.max(canvas.width, canvas.height));
    let out = canvas;
    if (scale < 1) {
      const small = document.createElement("canvas");
      small.width = Math.round(canvas.width * scale);
      small.height = Math.round(canvas.height * scale);
      small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
      out = small;
    }
    return await new Promise((resolve) =>
      out.toBlob((blob) => resolve(blob), "image/jpeg", 0.7),
    );
  } catch {
    return null;
  }
}
