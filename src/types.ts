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

// A persisted report, normalised to a transport-friendly shape. Persistence
// adapters map their own storage rows to/from this; the triage UI renders it.
export interface BugReportRecord {
  id: string;
  reporterId?: string | null;
  reporterName?: string;
  reporterEmail?: string;
  title: string;
  description: string;
  screenshotUrl: string;
  screenshotKey?: string;
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
  screenshotUrl: string;
  screenshotKey: string;
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
