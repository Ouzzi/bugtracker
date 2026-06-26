import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "../src/client/screenshot";

describe("dataUrlToBlob", () => {
  it("decodes a base64 data: URL to a Blob with the right type and bytes", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,AAAA");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3); // "AAAA" (base64) -> 3 zero bytes
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([0, 0, 0]);
  });

  it("decodes a non-base64 (percent-encoded) data: URL", async () => {
    const blob = dataUrlToBlob("data:text/plain,Hello%20World");
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("Hello World");
  });

  it("defaults the mime type when the data: URL omits one", () => {
    const blob = dataUrlToBlob("data:,abc");
    expect(blob.type).toBe("application/octet-stream");
  });
});
