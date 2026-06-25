"use client";

import { useCallback, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { capturePage } from "./capture";
import { themeVars, type BugReportTheme } from "./theme";

export type { BugReportTheme } from "./theme";

export interface BugReportLabels {
  /** Tooltip + aria-label on the floating button. */
  trigger: string;
  title: string;
  description: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  screenshotLabel: string;
  noScreenshot: string;
  cancel: string;
  submit: string;
  submitting: string;
  missingTitle: string;
}

export const DEFAULT_LABELS: BugReportLabels = {
  trigger: "Report a bug",
  title: "Report a bug",
  description:
    "A screenshot of this page is attached automatically. Tell us what went wrong.",
  titleLabel: "Title",
  titlePlaceholder: "e.g. Save button does nothing on the editor",
  descriptionLabel: "Description",
  descriptionPlaceholder: "What did you expect, and what happened instead?",
  screenshotLabel: "Screenshot",
  noScreenshot: "No screenshot could be captured — the report will be sent without one.",
  cancel: "Cancel",
  submit: "Send report",
  submitting: "Sending...",
  missingTitle: "Please add a short title.",
};

export interface BugSubmitResult {
  ok?: boolean;
  id?: string;
  screenshotSaved?: boolean;
  screenshotNote?: string;
  [key: string]: unknown;
}

export interface BugReportButtonProps {
  /** Where reports are POSTed. Default `/api/bugs`. */
  endpoint?: string;
  /** Capture a screenshot of the page on open. Default `true`. */
  captureScreenshot?: boolean;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  labels?: Partial<BugReportLabels>;
  theme?: BugReportTheme;
  className?: string;
  /** Called with the server's JSON after a successful submit (wire your toast here). */
  onSubmitted?: (result: BugSubmitResult) => void;
  /** Called with a human-readable message when a submit fails. */
  onError?: (message: string) => void;
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="bgt-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function BugReportButton({
  endpoint = "/api/bugs",
  captureScreenshot = true,
  position = "bottom-right",
  labels: labelOverrides,
  theme,
  className,
  onSubmitted,
  onError,
}: BugReportButtonProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const vars = themeVars(theme);

  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setShotUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setShot(null);
    setTitle("");
    setDescription("");
    setError("");
  }, []);

  async function startReport() {
    if (capturing) return;
    setCapturing(true);
    // Capture before opening the dialog so the form is never in the screenshot.
    const blob = captureScreenshot ? await capturePage() : null;
    setShot(blob);
    setShotUrl(blob ? URL.createObjectURL(blob) : null);
    setOpen(true);
    setCapturing(false);
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) reset();
  }

  async function submit() {
    if (!title.trim()) {
      setError(labels.missingTitle);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      fd.append("pageUrl", window.location.pathname + window.location.search);
      if (shot) fd.append("screenshot", shot, "screenshot.jpg");

      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as BugSubmitResult;
      if (!res.ok) {
        onError?.((data.error as string) ?? "Could not send the report");
        return;
      }
      onSubmitted?.(data);
      setOpen(false);
      reset();
    } catch {
      onError?.("Could not send the report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-bug-widget="true"
      data-pos={position}
      className={`bgt-root bgt-widget${className ? ` ${className}` : ""}`}
      style={vars}
    >
      <button
        type="button"
        aria-label={labels.trigger}
        onClick={startReport}
        disabled={capturing}
        className="bgt-fab"
      >
        {capturing ? <Spinner /> : <BugIcon />}
      </button>
      <span role="tooltip" className="bgt-tooltip">
        {labels.trigger}
      </span>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="bgt-overlay" />
          <Dialog.Content className="bgt-root bgt-content" style={vars}>
            <Dialog.Title className="bgt-title">{labels.title}</Dialog.Title>
            <Dialog.Description className="bgt-desc">
              {labels.description}
            </Dialog.Description>

            <div className="bgt-field">
              <label className="bgt-label" htmlFor="bgt-title-input">
                {labels.titleLabel}
              </label>
              <input
                id="bgt-title-input"
                className="bgt-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder={labels.titlePlaceholder}
                autoFocus
              />
            </div>

            <div className="bgt-field">
              <label className="bgt-label" htmlFor="bgt-desc-input">
                {labels.descriptionLabel}
              </label>
              <textarea
                id="bgt-desc-input"
                className="bgt-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder={labels.descriptionPlaceholder}
              />
            </div>

            <div className="bgt-field">
              <span className="bgt-label">{labels.screenshotLabel}</span>
              {shotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL
                <img className="bgt-shot" src={shotUrl} alt="Captured page screenshot" />
              ) : (
                <p className="bgt-hint">{labels.noScreenshot}</p>
              )}
            </div>

            {error && <p className="bgt-error">{error}</p>}

            <div className="bgt-actions">
              <button
                type="button"
                className="bgt-btn bgt-btn-ghost"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                className="bgt-btn bgt-btn-primary"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? labels.submitting : labels.submit}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
