/* eslint-disable @typescript-eslint/no-explicit-any -- AWS SDK is an optional peer
   imported dynamically; we avoid a hard type dependency on it. */
import type { UploadAdapter } from "../server/types.js";

export interface S3UploadOptions {
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Public base URL objects are served from; the key is appended. */
  publicBaseUrl?: string;
}

// S3_ENDPOINT is often pasted without a scheme; the AWS SDK needs a parseable
// absolute URL or it throws "Invalid URL" on every request.
function resolveEndpoint(raw?: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * S3-compatible screenshot upload (AWS S3, MinIO, Cloudflare R2, …). Reads config
 * from the passed options, falling back to S3_* environment variables. Requires
 * `@aws-sdk/client-s3` to be installed in the host project.
 */
export function createS3Upload(options: S3UploadOptions = {}): UploadAdapter {
  const cfg = {
    bucket: options.bucket ?? process.env.S3_BUCKET,
    region: (options.region ?? process.env.S3_REGION ?? "us-east-1").trim(),
    endpoint: resolveEndpoint(options.endpoint ?? process.env.S3_ENDPOINT),
    accessKeyId: (options.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? "").trim(),
    secretAccessKey: (
      options.secretAccessKey ??
      process.env.S3_SECRET_ACCESS_KEY ??
      ""
    ).trim(),
    publicBaseUrl: options.publicBaseUrl ?? process.env.S3_PUBLIC_BASE_URL ?? "",
  };

  let clientPromise: Promise<any> | null = null;
  async function getClient(): Promise<any> {
    if (!clientPromise) {
      clientPromise = (async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        return new S3Client({
          region: cfg.region,
          endpoint: cfg.endpoint,
          // Path-style addressing is required by most self-hosted S3 gateways.
          forcePathStyle: Boolean(cfg.endpoint),
          credentials: {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
          },
        });
      })();
    }
    return clientPromise;
  }

  return {
    isConfigured() {
      // publicBaseUrl is required: upload() builds the returned URL from it, so
      // without it a stored screenshot would resolve to a broken relative path.
      return Boolean(
        cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey && cfg.publicBaseUrl,
      );
    },
    async upload(key: string, body: Buffer, contentType: string): Promise<string> {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getClient();
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      const base = cfg.publicBaseUrl.replace(/\/$/, "");
      // Encode each path segment so a key with URL-unsafe characters (space, #, …)
      // still yields a valid public URL; the raw `key` is what callers store for
      // later S3 operations, so only the returned URL is encoded.
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      return `${base}/${encodedKey}`;
    },
  };
}
