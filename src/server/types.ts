import type {
  BugReportRecord,
  BugStatus,
  ListQuery,
  NewBugReport,
  UpdatePatch,
} from "../types.js";

// ---- Adapters: every host-specific concern is injected through one of these. ---

/** Where reports live. Ship a Mongoose adapter; swap for SQL/remote without
 *  touching the handlers. */
export interface PersistenceAdapter {
  create(input: NewBugReport): Promise<BugReportRecord>;
  list(query: ListQuery): Promise<{ bugs: BugReportRecord[]; total: number }>;
  update(id: string, patch: UpdatePatch): Promise<BugReportRecord | null>;
}

export interface Actor {
  id?: string;
  name?: string;
  email?: string;
  /** Gates the triage endpoints (list + update). */
  isAdmin: boolean;
}

/** Resolves the caller from the incoming request (session cookie, header, …). */
export interface AuthAdapter {
  getActor(request: Request): Promise<Actor | null>;
  /** Allow reports without a signed-in user. Default: false. */
  allowAnonymous?: boolean;
}

/** Stores a screenshot and returns its public URL. Omit to disable screenshots. */
export interface UploadAdapter {
  isConfigured(): boolean;
  upload(key: string, body: Buffer, contentType: string): Promise<string>;
}

/** Side effect fired after a report is created (e.g. notify admins). Best-effort. */
export interface NotifyAdapter {
  onNewReport(report: BugReportRecord): Promise<void>;
}

/** Returns false when the caller has exceeded the window. */
export interface RateLimitAdapter {
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export interface BugtrackerMessages {
  unauthorized: string;
  forbidden: string;
  rateLimited: string;
  titleRequired: string;
  titleTooLong: string;
  descriptionTooLong: string;
  notFound: string;
  nothingToUpdate: string;
  invalidStatus: string;
  // Screenshot diagnostics, surfaced to the reporter + stored on the record.
  noScreenshotCaptured: string;
  storageNotConfigured: string;
  unsupportedType: (type: string) => string;
  screenshotTooLarge: string;
  uploadFailed: (reason: string) => string;
}

export interface BugtrackerLimits {
  rate: { count: number; windowMs: number };
  maxScreenshotBytes: number;
  titleMax: number;
  descriptionMax: number;
}

export interface BugtrackerServerConfig {
  persistence: PersistenceAdapter;
  auth: AuthAdapter;
  upload?: UploadAdapter;
  notify?: NotifyAdapter;
  rateLimit?: RateLimitAdapter;
  /** Tags every report (central multi-project inbox). Omit for a local install. */
  project?: string;
  statuses?: readonly BugStatus[];
  limits?: Partial<BugtrackerLimits>;
  messages?: Partial<BugtrackerMessages>;
  /** Optional audit hook fired on a successful triage update. */
  onAudit?: (event: {
    actor: Actor;
    bugId: string;
    changes: UpdatePatch;
  }) => Promise<void> | void;
}

/** Route handlers, shaped for the Next.js App Router. */
export interface BugReportHandlers {
  collection: {
    POST: (request: Request) => Promise<Response>;
    GET: (request: Request) => Promise<Response>;
  };
  item: {
    PATCH: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  };
}
