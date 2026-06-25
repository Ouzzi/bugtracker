"use client";

import { useCallback, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { capturePage } from "./capture.js";
import { themeVars, type BugReportTheme } from "./theme.js";

export type { BugReportTheme } from "./theme.js";

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
  addScreenshot: string;
  removeScreenshot: string;
  pasteHint: string;
  cancel: string;
  submit: string;
  submitting: string;
  missingTitle: string;
}

export const DEFAULT_LABELS: BugReportLabels = {
  trigger: "Report a bug",
  title: "Report a bug",
  description:
    "A screenshot of this page is attached automatically. Remove it, add more, or paste images — then tell us what went wrong.",
  titleLabel: "Title",
  titlePlaceholder: "e.g. Save button does nothing on the editor",
  descriptionLabel: "Description",
  descriptionPlaceholder: "What did you expect, and what happened instead?",
  screenshotLabel: "Screenshots",
  noScreenshot: "No screenshot attached.",
  addScreenshot: "Add image",
  removeScreenshot: "Remove screenshot",
  pasteHint: "Tip: paste an image with Ctrl+V.",
  cancel: "Cancel",
  submit: "Send report",
  submitting: "Sending...",
  missingTitle: "Please add a short title.",
};

export interface BugSubmitResult {
  ok?: boolean;
  id?: string;
  screenshotSaved?: boolean;
  screenshotCount?: number;
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

interface Shot {
  id: string;
  blob: Blob;
  url: string;
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

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

let shotSeq = 0;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const addShot = useCallback((blob: Blob) => {
    setShots((prev) => [
      ...prev,
      { id: `s${++shotSeq}`, blob, url: URL.createObjectURL(blob) },
    ]);
  }, []);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const found = prev.find((s) => s.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
    setTitle("");
    setDescription("");
    setError("");
  }, []);

  async function startReport() {
    if (capturing) return;
    setCapturing(true);
    // Capture before opening the dialog so the form is never in the screenshot.
    const blob = captureScreenshot ? await capturePage() : null;
    if (blob) addShot(blob);
    setOpen(true);
    setCapturing(false);
  }

  function addImageFiles(files: FileList | File[] | null | undefined) {
    if (!files) return false;
    let added = false;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        addShot(file);
        added = true;
      }
    }
    return added;
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    addImageFiles(e.target.files);
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) images.push(file);
      }
    }
    if (images.length) {
      // Consume the paste as an image attachment so it doesn't also land as text.
      e.preventDefault();
      addImageFiles(images);
    }
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
      shots.forEach((s, i) => fd.append("screenshot", s.blob, `screenshot-${i + 1}.png`));

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
          <Dialog.Content className="bgt-root bgt-content" style={vars} onPaste={onPaste}>
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
              <div className="bgt-shots">
                {shots.map((s) => (
                  <div key={s.id} className="bgt-shot-item">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                    <img className="bgt-shot-thumb" src={s.url} alt="Attached screenshot" />
                    <button
                      type="button"
                      className="bgt-shot-remove"
                      aria-label={labels.removeScreenshot}
                      onClick={() => removeShot(s.id)}
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="bgt-add"
                  onClick={() => fileInputRef.current?.click()}
                  title={labels.addScreenshot}
                >
                  <PlusIcon />
                  <span>{labels.addScreenshot}</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="bgt-file-hidden"
                onChange={onPickFiles}
              />
              <p className="bgt-hint">
                {shots.length === 0 ? `${labels.noScreenshot} ` : ""}
                {labels.pasteHint}
              </p>
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
