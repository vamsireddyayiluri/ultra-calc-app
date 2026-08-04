// src/components/validation/ValidationSummary.tsx
//
// Non-blocking, read-only rollup of a ProjectValidationResult
// (src/validations.ts/projectValidator.ts). Never blocks editing, saving,
// or navigation — it only reports what the validator already computed.
import React from "react";
import {
  ProjectValidationResult,
  PROJECT_FIELD_LABELS,
  ROOM_FIELD_LABELS,
} from "../../validations.ts/projectValidator";

export type ValidationNavigateTarget =
  | { scope: "project"; field: string }
  | { scope: "room"; roomId: string; field: string };

interface ValidationSummaryProps {
  validation: ProjectValidationResult;
  /** Called when the user clicks a specific field/room issue — lets the caller (ProjectEditor) switch tabs, expand the room, and scroll/focus the field. Purely optional: omitting it just makes the summary non-interactive, same as before. */
  onNavigate?: (target: ValidationNavigateTarget) => void;
}

const projectFieldLabel = (key: string): string =>
  PROJECT_FIELD_LABELS[key as keyof typeof PROJECT_FIELD_LABELS] ?? key;

const roomFieldLabel = (key: string): string =>
  ROOM_FIELD_LABELS[key as keyof typeof ROOM_FIELD_LABELS] ?? key;

export const ValidationSummary: React.FC<ValidationSummaryProps> = ({
  validation,
  onNavigate,
}) => {
  const { summary, projectFields, rooms } = validation;

  const projectFieldKeys = Object.keys(projectFields);
  const roomsWithIssues = Object.values(rooms).filter(
    (r) => r.status !== "valid",
  );

  const hasIssues =
    projectFieldKeys.length > 0 ||
    roomsWithIssues.length > 0 ||
    summary.totalWarnings > 0;

  // aria-live="polite" so this updates without stealing focus from
  // whatever field the user is currently editing — it reports state, it
  // never interrupts.
  if (!hasIssues) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800"
      >
        <span aria-hidden="true">✓</span>
        <span>Project details and all rooms are complete and valid.</span>
      </div>
    );
  }

  const itemClass = (status: "invalid" | "incomplete") =>
    status === "invalid"
      ? "text-red-700 hover:bg-red-50"
      : "text-amber-700 hover:bg-amber-50";

  const itemIcon = (status: "invalid" | "incomplete") =>
    status === "invalid" ? "⚠" : "○";

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
    >
      <div className="mb-1.5 font-semibold text-slate-700">
        Project status
        {(summary.totalErrors > 0 || summary.totalIncomplete > 0) && (
          <span className="ml-1.5 font-normal text-slate-500">
            — click an item to jump to it
          </span>
        )}
      </div>

      {projectFieldKeys.length > 0 && (
        <ul className="mb-1.5 space-y-0.5">
          {projectFieldKeys.map((field) => {
            const fv = projectFields[field];
            const clickable = Boolean(onNavigate);
            return (
              <li key={field}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onNavigate?.({ scope: "project", field })}
                  className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left ${itemClass(fv.status as "invalid" | "incomplete")} ${clickable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span aria-hidden="true">{itemIcon(fv.status as "invalid" | "incomplete")}</span>
                  <span>{projectFieldLabel(field)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {roomsWithIssues.length > 0 && (
        <ul className="mb-1.5 space-y-0.5">
          {roomsWithIssues.map((room) => {
            const badFields = [
              ...Object.keys(room.errors),
              ...Object.keys(room.incomplete),
            ];
            const firstField = badFields[0];
            const clickable = Boolean(onNavigate) && Boolean(firstField);
            return (
              <li key={room.roomId}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() =>
                    firstField &&
                    onNavigate?.({
                      scope: "room",
                      roomId: room.roomId,
                      field: firstField,
                    })
                  }
                  className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left ${itemClass(room.status === "invalid" ? "invalid" : "incomplete")} ${clickable ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span aria-hidden="true">
                    {itemIcon(room.status === "invalid" ? "invalid" : "incomplete")}
                  </span>
                  <span>
                    {room.roomName || "Unnamed room"} —{" "}
                    {badFields.length <= 3
                      ? badFields.map(roomFieldLabel).join(", ")
                      : `${badFields.length} fields`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {summary.totalWarnings > 0 && (
        <div className="flex items-center gap-1.5 text-sky-700">
          <span aria-hidden="true">ℹ</span>
          <span>
            {summary.totalWarnings} warning
            {summary.totalWarnings === 1 ? "" : "s"} to review
          </span>
        </div>
      )}

      <div className="mt-1.5 text-xs text-slate-400">
        This does not block editing or saving.
      </div>
    </div>
  );
};
