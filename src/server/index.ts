// Server entry point — route-handler factory + adapter contracts.
export { createBugReportHandlers } from "./handlers";
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
} from "./types";
export type {
  BugReportRecord,
  BugStatus,
  ListQuery,
  NewBugReport,
  UpdatePatch,
} from "../types";
export { DEFAULT_STATUSES, DEFAULT_STATUS_LABELS } from "../types";
