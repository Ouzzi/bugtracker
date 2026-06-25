// Client entry point — components rendered in the browser.
export { BugReportButton, DEFAULT_LABELS } from "./client/BugReportButton.js";
export type {
  BugReportButtonProps,
  BugReportLabels,
  BugSubmitResult,
} from "./client/BugReportButton.js";

export { BugTrackerView } from "./client/BugTrackerView.js";
export type { BugTrackerViewProps } from "./client/BugTrackerView.js";

export { themeVars } from "./client/theme.js";
export type { BugReportTheme } from "./client/theme.js";

export {
  DEFAULT_STATUSES,
  DEFAULT_STATUS_LABELS,
} from "./types.js";
export type { BugStatus, BugReportRecord, BugScreenshot } from "./types.js";
