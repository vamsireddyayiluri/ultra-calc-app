// src/components/validation/ProjectStatusCard.tsx
//
// Compact, non-blocking status card — replaces the bare ValidationSummary
// as the primary UI. Combines the dirty tracker's persistence state
// (src/hooks/useProjectDirtyTracker.ts) with the validator's own,
// already-computed summary (src/validations.ts/projectValidator.ts) —
// neither is re-derived here. Full validation detail stays available
// behind a "Show details" toggle instead of dominating the default view.
import React, { useState } from "react";
import { ProjectDirtyTracker } from "../../hooks/useProjectDirtyTracker";
import { ProjectStatus } from "../../utils/projectDirtyTracker";
import { ProjectValidationResult } from "../../validations.ts/projectValidator";
import { ValidationSummary, ValidationNavigateTarget } from "./ValidationSummary";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface ProjectStatusCardProps {
  tracker: ProjectDirtyTracker;
  validation: ProjectValidationResult;
  /** Forwarded straight through to ValidationSummary — see its own doc comment. */
  onNavigate?: (target: ValidationNavigateTarget) => void;
}

const STATUS_META: Record<
  ProjectStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  invalid: { label: "Needs attention", dotClass: "bg-red-500", textClass: "text-red-700" },
  error: { label: "Save failed", dotClass: "bg-red-500", textClass: "text-red-700" },
  draft: { label: "Draft", dotClass: "bg-amber-400", textClass: "text-amber-700" },
  incomplete: { label: "Incomplete", dotClass: "bg-amber-400", textClass: "text-amber-700" },
  readyToSave: { label: "Ready to save", dotClass: "bg-sky-500", textClass: "text-sky-700" },
  saving: { label: "Saving…", dotClass: "bg-sky-500", textClass: "text-sky-700" },
  saved: { label: "Saved", dotClass: "bg-emerald-500", textClass: "text-emerald-700" },
};

/** One short headline built from the validator's own summary counts — never re-derived. */
function validationHeadline(validation: ProjectValidationResult): string | null {
  const { summary, projectIncomplete } = validation;

  if (summary.totalErrors > 0) {
    return `${summary.totalErrors} invalid field${summary.totalErrors === 1 ? "" : "s"}`;
  }

  const parts: string[] = [];
  if (summary.incompleteRooms > 0) {
    parts.push(
      `${summary.incompleteRooms} incomplete room${summary.incompleteRooms === 1 ? "" : "s"}`,
    );
  }
  if (Object.keys(projectIncomplete).length > 0) {
    parts.push("project details incomplete");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const ProjectStatusCard: React.FC<ProjectStatusCardProps> = ({
  tracker,
  validation,
  onNavigate,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const meta = STATUS_META[tracker.projectStatus];
  const headline = validationHeadline(validation);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dotClass}`}
          />
          <span className={`font-semibold ${meta.textClass}`}>{meta.label}</span>
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((s) => !s)}
          className="text-xs font-medium text-teal-600 hover:text-teal-700"
          aria-expanded={detailsOpen}
        >
          {detailsOpen ? "Hide details" : "Show details"}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
        <div>{tracker.hasChanges ? "Unsaved changes" : "No changes since last saved"}</div>
        {headline && <div className={meta.textClass}>{headline}</div>}
        <div className="text-slate-400 sm:text-right">
          Last saved: {formatRelativeTime(tracker.lastSavedAt)}
        </div>
      </div>

      {detailsOpen && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <ValidationSummary validation={validation} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
};
