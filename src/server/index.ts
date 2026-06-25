// Server entry point — route-handler factory + adapter contracts.
export { createBugReportHandlers } from "./handlers.js";
export type {
  Actor,
  AuthAdapter,
  BugReportHandlers,
  BugtrackerLimits,
  BugtrackerMessages,
  BugtrackerServerConfig,
  NotifyAdapter,
  PersistenceAdapter,
  RateLimitAdapter,
  UploadAdapter,
} from "./types.js";
export type {
  BugReportRecord,
  BugScreenshot,
  BugStatus,
  ListQuery,
  NewBugReport,
  UpdatePatch,
} from "../types.js";
export { DEFAULT_STATUSES, DEFAULT_STATUS_LABELS } from "../types.js";
