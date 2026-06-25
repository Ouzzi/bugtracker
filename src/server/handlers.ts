import { randomUUID } from "crypto";
import { DEFAULT_STATUSES, type BugScreenshot, type BugStatus } from "../types.js";
import type {
  BugReportHandlers,
  BugtrackerLimits,
  BugtrackerMessages,
  BugtrackerServerConfig,
} from "./types.js";

const SHOT_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DEFAULT_LIMITS: BugtrackerLimits = {
  rate: { count: 20, windowMs: 60 * 60 * 1000 }, // 20 reports / hour
  maxScreenshotBytes: 5 * 1024 * 1024, // 5 MB
  maxScreenshots: 10,
  titleMax: 200,
  descriptionMax: 5000,
};

const DEFAULT_MESSAGES: BugtrackerMessages = {
  unauthorized: "Unauthorized",
  forbidden: "Forbidden",
  rateLimited: "Too many reports, please slow down",
  titleRequired: "A title is required",
  titleTooLong: "Title is too long (max 200)",
  descriptionTooLong: "Description is too long (max 5000)",
  notFound: "Bug report not found",
  nothingToUpdate: "Nothing to update",
  invalidStatus: "Invalid status",
  noScreenshotCaptured: "No screenshot was captured in the browser",
  storageNotConfigured: "Object storage (S3) is not configured on the server",
  unsupportedType: (type) => `Unsupported screenshot type: ${type || "unknown"}`,
  screenshotTooLarge: "Screenshot exceeds the 5 MB limit",
  tooManyScreenshots: (max) => `Too many screenshots — only the first ${max} were kept`,
  uploadFailed: (reason) => `Screenshot upload failed: ${reason}`,
};

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
function jsonOk<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

/**
 * Builds the bug-report route handlers from a set of adapters. The wiring is
 * intentionally framework-light: handlers take a web `Request` and return a web
 * `Response`, which the Next.js App Router accepts directly.
 *
 *   const h = createBugReportHandlers({ persistence, auth, upload, ... });
 *   export const { POST, GET } = h.collection;   // app/api/bugs/route.ts
 *   export const { PATCH } = h.item;             // app/api/bugs/[id]/route.ts
 */
export function createBugReportHandlers(
  config: BugtrackerServerConfig,
): BugReportHandlers {
  const { persistence, auth, upload, notify, rateLimit, project, onAudit } = config;
  const limits: BugtrackerLimits = { ...DEFAULT_LIMITS, ...config.limits };
  const messages: BugtrackerMessages = { ...DEFAULT_MESSAGES, ...config.messages };
  const statuses: readonly BugStatus[] = config.statuses ?? DEFAULT_STATUSES;

  async function POST(request: Request): Promise<Response> {
    const actor = await auth.getActor(request);
    if (!actor && !auth.allowAnonymous) return jsonError(messages.unauthorized, 401);

    const rlKey = `bug:${actor?.id ?? "anon"}`;
    if (rateLimit && !(await rateLimit.consume(rlKey, limits.rate.count, limits.rate.windowMs))) {
      return jsonError(messages.rateLimited, 429);
    }

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const pageUrl = String(form.get("pageUrl") ?? "").trim().slice(0, 500);
    if (!title) return jsonError(messages.titleRequired);
    if (title.length > limits.titleMax) return jsonError(messages.titleTooLong);
    if (description.length > limits.descriptionMax) {
      return jsonError(messages.descriptionTooLong);
    }

    // Best-effort screenshots (zero or more). We record *why* any were dropped so
    // a missing image is diagnosable: no file means nothing was attached/captured;
    // the other notes point at object-storage config/permissions on the server.
    const allFiles = form
      .getAll("screenshot")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const screenshots: BugScreenshot[] = [];
    const notes: string[] = [];
    if (allFiles.length === 0) {
      notes.push(messages.noScreenshotCaptured);
    } else if (!upload || !upload.isConfigured()) {
      notes.push(messages.storageNotConfigured);
    } else {
      // Cap the count so one request can't fan out into unbounded uploads/memory.
      const files = allFiles.slice(0, limits.maxScreenshots);
      if (allFiles.length > files.length) {
        notes.push(messages.tooManyScreenshots(limits.maxScreenshots));
      }
      // Validate synchronously, then upload the survivors concurrently while
      // preserving input order (Promise.all keeps the array order).
      const valid: File[] = [];
      for (const file of files) {
        if (!SHOT_EXT_BY_MIME[file.type]) {
          notes.push(messages.unsupportedType(file.type));
        } else if (file.size > limits.maxScreenshotBytes) {
          notes.push(messages.screenshotTooLarge);
        } else {
          valid.push(file);
        }
      }
      const results = await Promise.all(
        valid.map(async (file): Promise<{ shot?: BugScreenshot; note?: string }> => {
          const key = `bugs/${new Date().getFullYear()}/${randomUUID()}.${SHOT_EXT_BY_MIME[file.type]}`;
          try {
            const buffer = Buffer.from(await file.arrayBuffer());
            const url = await upload.upload(key, buffer, file.type);
            return { shot: { url, key } as BugScreenshot };
          } catch (err) {
            return {
              note: messages.uploadFailed(err instanceof Error ? err.message : "unknown error"),
            };
          }
        }),
      );
      for (const r of results) {
        if (r.shot) screenshots.push(r.shot);
        else if (r.note) notes.push(r.note);
      }
    }
    const screenshotNote = notes.join("; ");

    const report = await persistence.create({
      reporterId: actor?.id ?? null,
      reporterName: actor?.name,
      reporterEmail: actor?.email,
      title: title.slice(0, limits.titleMax),
      description: description.slice(0, limits.descriptionMax),
      screenshots,
      screenshotNote,
      pageUrl,
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 400),
      project,
    });

    if (notify) {
      try {
        await notify.onNewReport(report);
      } catch {
        // best-effort — never block the report on a notification failure
      }
    }

    return jsonOk(
      {
        ok: true,
        id: report.id,
        screenshotSaved: screenshots.length > 0,
        screenshotCount: screenshots.length,
        screenshotNote,
      },
      201,
    );
  }

  async function GET(request: Request): Promise<Response> {
    const actor = await auth.getActor(request);
    if (!actor || !actor.isAdmin) return jsonError(messages.forbidden, 403);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 100);
    const skip = Math.max(Number(searchParams.get("skip") ?? 0), 0);
    const statusParam = searchParams.get("status");
    const status =
      statusParam && statuses.includes(statusParam) ? statusParam : undefined;
    const projectParam = searchParams.get("project") ?? undefined;

    const { bugs, total } = await persistence.list({
      status,
      project: projectParam,
      limit,
      skip,
    });
    return jsonOk({ bugs, total });
  }

  async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const actor = await auth.getActor(request);
    if (!actor || !actor.isAdmin) return jsonError(messages.forbidden, 403);

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | { status?: unknown; adminNote?: unknown }
      | null;
    if (!body || typeof body !== "object") return jsonError(messages.nothingToUpdate);

    const patch: { status?: BugStatus; adminNote?: string } = {};
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !statuses.includes(body.status)) {
        return jsonError(messages.invalidStatus);
      }
      patch.status = body.status;
    }
    if (body.adminNote !== undefined) {
      if (typeof body.adminNote !== "string" || body.adminNote.length > limits.descriptionMax) {
        return jsonError(messages.descriptionTooLong);
      }
      patch.adminNote = body.adminNote;
    }
    if (Object.keys(patch).length === 0) return jsonError(messages.nothingToUpdate);

    const bug = await persistence.update(id, patch);
    if (!bug) return jsonError(messages.notFound, 404);

    if (onAudit) {
      try {
        await onAudit({ actor, bugId: id, changes: patch });
      } catch {
        // best-effort — auditing must never fail the update
      }
    }

    return jsonOk({ bug });
  }

  return { collection: { POST, GET }, item: { PATCH } };
}
