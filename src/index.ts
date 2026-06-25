// Client entry point — components rendered in the browser.
export { BugReportButton, DEFAULT_LABELS } from "./client/BugReportButton";
export type {
  BugReportButtonProps,
  BugReportLabels,
  BugSubmitResult,
} from "./client/BugReportButton";

export { BugTrackerView } from "./client/BugTrackerView";
export type { BugTrackerViewProps } from "./client/BugTrackerView";

export { themeVars } from "./client/theme";
export type { BugReportTheme } from "./client/theme";

export {
  DEFAULT_STATUSES,
  DEFAULT_STATUS_LABELS,
} from "./types";
export type { BugStatus, BugReportRecord } from "./types";
