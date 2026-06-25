import {
  toScreenshots,
  type BugReportRecord,
  type ListQuery,
  type NewBugReport,
  type UpdatePatch,
} from "../types.js";
import type { PersistenceAdapter } from "../server/types.js";

export interface RemotePersistenceOptions {
  /** Base URL of the central bug store, e.g. "https://bugs.example.com/api". */
  endpoint: string;
  /** Shared secret sent as `x-bugtracker-secret` to authenticate this project. */
  secret?: string;
  /** Tags reports with the originating project (central multi-project inbox). */
  project?: string;
  /** Extra headers (e.g. a bearer token). */
  headers?: Record<string, string>;
}

/**
 * Forwards persistence to a central HTTP store so many projects can share one
 * bug inbox. The local route handler keeps owning auth, rate-limiting and
 * screenshot upload; only storage is remote. The store is expected to expose:
 *
 *   POST   {endpoint}/reports        -> { bug: BugReportRecord }
 *   GET    {endpoint}/reports?...     -> { bugs: BugReportRecord[]; total }
 *   PATCH  {endpoint}/reports/{id}    -> { bug: BugReportRecord }
 */
export function createRemotePersistence(
  options: RemotePersistenceOptions,
): PersistenceAdapter {
  const base = options.endpoint.replace(/\/$/, "");

  function headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = { ...options.headers };
    if (json) h["Content-Type"] = "application/json";
    if (options.secret) h["x-bugtracker-secret"] = options.secret;
    return h;
  }

  async function readJson(res: Response): Promise<any> {
    if (!res.ok) {
      throw new Error(`Remote bug store responded ${res.status}`);
    }
    return res.json();
  }

  // The remote store may run an older version that still returns the legacy
  // single-screenshot shape (or omits screenshots entirely). Normalise here so
  // downstream code (and the triage UI) always sees a `screenshots` array.
  function normalize(bug: any): BugReportRecord {
    return { ...bug, screenshots: toScreenshots(bug ?? {}) };
  }

  return {
    async create(input: NewBugReport): Promise<BugReportRecord> {
      const res = await fetch(`${base}/reports`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ ...input, project: input.project ?? options.project }),
      });
      const data = await readJson(res);
      return normalize(data.bug ?? data);
    },

    async list(query: ListQuery): Promise<{ bugs: BugReportRecord[]; total: number }> {
      const qs = new URLSearchParams();
      if (query.status) qs.set("status", query.status);
      qs.set("project", query.project ?? options.project ?? "");
      qs.set("limit", String(query.limit));
      qs.set("skip", String(query.skip));
      const res = await fetch(`${base}/reports?${qs.toString()}`, {
        headers: headers(false),
      });
      const data = await readJson(res);
      return { bugs: (data.bugs ?? []).map(normalize), total: data.total ?? 0 };
    },

    async update(id: string, patch: UpdatePatch): Promise<BugReportRecord | null> {
      const res = await fetch(`${base}/reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: headers(true),
        body: JSON.stringify(patch),
      });
      if (res.status === 404) return null;
      const data = await readJson(res);
      return normalize(data.bug ?? data);
    },
  };
}
