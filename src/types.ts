// Shared, runtime-free vocabulary used by both the client widgets and the server
// handlers. Keeping it dependency-free means importing it never drags server-only
// code into a client bundle (or vice versa).

// A status is just a string so every project can define its own workflow. The
// defaults below mirror a typical open -> in_progress -> resolved/closed flow.
export type BugStatus = string;

export const DEFAULT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export const DEFAULT_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

// A single stored screenshot: its public URL plus the storage key (for cleanup).
export interface BugScreenshot {
  url: string;
  key?: string;
}

/**
 * Normalises a raw storage/transport row's screenshots into the canonical array.
 * Prefers the `screenshots` array; falls back to a legacy single-screenshot row
 * (`screenshotUrl`/`screenshotKey`); otherwise empty. The single place every
 * adapter should funnel rows through so legacy data never reaches the UI as
 * `undefined`.
 */
export function toScreenshots(row: {
  screenshots?: unknown;
  screenshotUrl?: unknown;
  screenshotKey?: unknown;
}): BugScreenshot[] {
  if (Array.isArray(row.screenshots) && row.screenshots.length) {
    return row.screenshots
      .filter((s): s is { url: unknown; key?: unknown } => !!s && typeof s === "object")
      .map((s) => ({ url: String(s.url ?? ""), key: s.key ? String(s.key) : undefined }))
      // Drop entries with no usable URL so a malformed row never yields a broken <img>.
      .filter((s) => s.url);
  }
  if (row.screenshotUrl) {
    return [
      { url: String(row.screenshotUrl), key: row.screenshotKey ? String(row.screenshotKey) : undefined },
    ];
  }
  return [];
}

// A persisted report, normalised to a transport-friendly shape. Persistence
// adapters map their own storage rows to/from this; the triage UI renders it.
export interface BugReportRecord {
  id: string;
  reporterId?: string | null;
  reporterName?: string;
  reporterEmail?: string;
  title: string;
  description: string;
  // Zero or more screenshots. Adapters reading legacy single-screenshot rows
  // should map them into a one-element array here.
  screenshots: BugScreenshot[];
  // Diagnostic note when some/all screenshots weren't stored (browser capture
  // failed, storage unconfigured, upload error, …).
  screenshotNote: string;
  pageUrl: string;
  userAgent: string;
  status: BugStatus;
  adminNote: string;
  // Set when many projects report into one shared inbox; omitted for a
  // single-project (local) install.
  project?: string;
  createdAt: string;
  updatedAt: string;
}

// What the server hands a persistence adapter to create a new row.
export interface NewBugReport {
  reporterId?: string | null;
  reporterName?: string;
  reporterEmail?: string;
  title: string;
  description: string;
  screenshots: BugScreenshot[];
  screenshotNote: string;
  pageUrl: string;
  userAgent: string;
  project?: string;
}

export interface ListQuery {
  status?: BugStatus;
  project?: string;
  limit: number;
  skip: number;
}

export interface UpdatePatch {
  status?: BugStatus;
  adminNote?: string;
}
