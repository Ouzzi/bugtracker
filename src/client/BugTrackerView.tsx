"use client";

import { useCallback, useEffect, useState } from "react";
import { themeVars, type BugReportTheme } from "./theme.js";
import {
  DEFAULT_STATUSES,
  DEFAULT_STATUS_LABELS,
  type BugReportRecord,
  type BugStatus,
} from "../types.js";

export interface BugTrackerViewProps {
  /** Base path of the bug API. Default `/api/bugs`. */
  endpoint?: string;
  statuses?: readonly BugStatus[];
  statusLabels?: Record<string, string>;
  /** How dates are rendered. Default `toLocaleString()`. */
  formatDate?: (value: string) => string;
  theme?: BugReportTheme;
  className?: string;
  /** Optional toast hook for save confirmations. */
  onSaved?: (message: string) => void;
  /** Optional toast hook for update errors. */
  onError?: (message: string) => void;
}

const STRINGS = {
  filter: "Filter",
  all: "All",
  loading: "Loading...",
  empty: "No bug reports.",
  status: "Status",
  notePlaceholder: "Internal note (visible to admins only)",
  saveNote: "Save note",
  unknown: "Unknown",
  loadFailed: "Failed to load bug reports",
  updateFailed: "Update failed",
  saved: "Saved",
  noShot: "No screenshot stored",
};

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(5, comma); // strip leading "data:"
  const base64 = /;base64$/i.test(header);
  const mime = header.replace(/;base64$/i, "") || "application/octet-stream";
  const data = dataUrl.slice(comma + 1);
  if (!base64) return new Blob([decodeURIComponent(data)], { type: mime });
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Opening a screenshot full-size. Browsers block top-level navigation to `data:`
// URLs (a common shape when an upload adapter inlines images as base64), which
// yields a blank tab. Convert those to a Blob URL — which browsers do allow to
// open — synchronously so the popup stays attributed to the user's click. http(s)
// and blob: URLs navigate normally via the anchor.
function openScreenshot(e: React.MouseEvent<HTMLAnchorElement>, url: string) {
  if (!url) {
    e.preventDefault();
    return;
  }
  if (!url.startsWith("data:")) return;
  e.preventDefault();
  try {
    const blobUrl = URL.createObjectURL(dataUrlToBlob(url));
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    // Revoke once the new tab has had time to load the image.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    // Conversion failed — nothing better to do than leave the click inert.
  }
}

export function BugTrackerView({
  endpoint = "/api/bugs",
  statuses = DEFAULT_STATUSES,
  statusLabels = DEFAULT_STATUS_LABELS,
  formatDate = (v) => new Date(v).toLocaleString(),
  theme,
  className,
  onSaved,
  onError,
}: BugTrackerViewProps) {
  const [bugs, setBugs] = useState<BugReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | BugStatus>("");

  const labelFor = (s: BugStatus) => statusLabels[s] ?? s;

  const load = useCallback(
    async (status: "" | BugStatus) => {
      setLoading(true);
      try {
        const qs = status ? `?status=${encodeURIComponent(status)}` : "";
        const res = await fetch(`${endpoint}${qs}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? STRINGS.loadFailed);
        setBugs(data.bugs ?? []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : STRINGS.loadFailed);
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  const onUpdated = useCallback((bug: BugReportRecord) => {
    setBugs((prev) => prev.map((b) => (b.id === bug.id ? bug : b)));
  }, []);

  if (error) return <p className="bgt-error">{error}</p>;

  return (
    <div
      className={`bgt-root bgt-view${className ? ` ${className}` : ""}`}
      style={themeVars(theme)}
    >
      <div className="bgt-filter">
        <label className="bgt-hint" htmlFor="bgt-filter-select">
          {STRINGS.filter}
        </label>
        <select
          id="bgt-filter-select"
          className="bgt-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "" | BugStatus)}
          aria-label="Filter by status"
        >
          <option value="">{STRINGS.all}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {labelFor(s)}
            </option>
          ))}
        </select>
      </div>

      {loading && bugs.length === 0 ? (
        <p className="bgt-hint">{STRINGS.loading}</p>
      ) : bugs.length === 0 ? (
        <p className="bgt-empty">{STRINGS.empty}</p>
      ) : (
        <div className="bgt-view">
          {bugs.map((bug, i) => (
            <BugCard
              // Fall back when a record arrives without a usable id, so duplicate
              // keys can't collapse every bug into a single rendered card.
              key={bug.id || bug.createdAt || i}
              bug={bug}
              endpoint={endpoint}
              statuses={statuses}
              labelFor={labelFor}
              formatDate={formatDate}
              onUpdated={onUpdated}
              onSaved={onSaved}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BugCardProps {
  bug: BugReportRecord;
  endpoint: string;
  statuses: readonly BugStatus[];
  labelFor: (s: BugStatus) => string;
  formatDate: (value: string) => string;
  onUpdated: (b: BugReportRecord) => void;
  onSaved?: (message: string) => void;
  onError?: (message: string) => void;
}

function BugCard({
  bug,
  endpoint,
  statuses,
  labelFor,
  formatDate,
  onUpdated,
  onSaved,
  onError,
}: BugCardProps) {
  const [note, setNote] = useState(bug.adminNote);
  const [busy, setBusy] = useState(false);

  async function patch(body: { status?: BugStatus; adminNote?: string }) {
    setBusy(true);
    try {
      const res = await fetch(`${endpoint}/${bug.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError?.(data.error ?? STRINGS.updateFailed);
        return;
      }
      onUpdated(data.bug as BugReportRecord);
      onSaved?.(STRINGS.saved);
    } finally {
      setBusy(false);
    }
  }

  const reporter = bug.reporterName || bug.reporterEmail || STRINGS.unknown;

  return (
    <div className="bgt-card">
      <div className="bgt-card-head">
        <div>
          <p className="bgt-card-title">{bug.title}</p>
          <p className="bgt-card-meta">
            {reporter} · {formatDate(bug.createdAt)}
            {bug.project ? <> · {bug.project}</> : null}
            {bug.pageUrl ? <> · {bug.pageUrl}</> : null}
          </p>
        </div>
        <span className="bgt-badge" data-status={bug.status}>
          {labelFor(bug.status)}
        </span>
      </div>

      {bug.description && <p className="bgt-card-body">{bug.description}</p>}

      {bug.screenshots && bug.screenshots.length > 0 ? (
        <div className="bgt-card-shots">
          {bug.screenshots.map((shot, i) => (
            <a
              key={shot.key ?? shot.url ?? i}
              href={shot.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openScreenshot(e, shot.url)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external asset, opens full size */}
              <img
                className="bgt-card-shot"
                src={shot.url}
                alt={`Screenshot ${i + 1} for "${bug.title}"`}
              />
            </a>
          ))}
        </div>
      ) : bug.screenshotNote ? (
        <p className="bgt-hint" style={{ marginTop: "0.75rem" }}>
          {STRINGS.noShot} — {bug.screenshotNote}
        </p>
      ) : null}

      <div className="bgt-card-row">
        <label className="bgt-hint" htmlFor={`bgt-status-${bug.id}`}>
          {STRINGS.status}
        </label>
        <select
          id={`bgt-status-${bug.id}`}
          className="bgt-select"
          value={bug.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value })}
          aria-label={`Status for ${bug.title}`}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {labelFor(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="bgt-field">
        <textarea
          className="bgt-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder={STRINGS.notePlaceholder}
        />
        <div style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="bgt-btn bgt-btn-ghost"
            disabled={busy || note === bug.adminNote}
            onClick={() => patch({ adminNote: note })}
          >
            {STRINGS.saveNote}
          </button>
        </div>
      </div>
    </div>
  );
}
