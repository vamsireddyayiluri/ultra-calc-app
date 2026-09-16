// src/components/export/CoverPage.tsx
//
// The report's first page. Per client requirement, this is NOT a
// separate cover + a separate Executive Summary page — it's one page
// combining Project Information, Project Summary (existing aggregate
// totals from useProjectSummary), and Project Notes (existing
// summary.notes, not regenerated here).
import React from "react";
import { ProjectSettings, RoomInput, ProjectSummary } from "../../models/projectTypes";
import { ReportPage } from "./ReportPage";
import { ReportRow, ReportSectionHeading } from "./reportPrimitives";
import { REGION_OPTIONS } from "../../models/presets";
import { STANDARDS_OPTIONS } from "../forms/ProjectForm";
import { formatProjectSummary } from "../../utils/formatProjectSummary";
import { getHeatingSystemLabel } from "../../utils/heatingSystem";
import { HEAT_PUMP_WATER_TEMPERATURE_NOTE } from "../../utils/formatWaterTemperature";

interface Props {
  project: ProjectSettings & { rooms: RoomInput[] };
  summary: ProjectSummary | null;
  logoBase64: string | null;
  pageNumber: number;
  totalPages: number;
  /** Called once this page has mounted (and its ref is attached) — this page has no async loading of its own, so it reports ready immediately. See src/utils/exportReadiness.ts. */
  onReady?: () => void;
}

const formatDate = (epochMs?: number) =>
  epochMs
    ? new Date(epochMs).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

export const CoverPage = React.forwardRef<HTMLDivElement, Props>(
  ({ project, summary, logoBase64, pageNumber, totalPages, onReady }, ref) => {
    React.useEffect(() => {
      onReady?.();
      // Fires once per mount — this page renders synchronously from
      // props, so "mounted" already means "ready."
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const regionLabel =
      REGION_OPTIONS.find((o) => o.key === project.region)?.label ??
      project.region;
    const standardsLabel =
      STANDARDS_OPTIONS.find((o) => o.key === project.standardsMode)?.label ??
      project.standardsMode;
    const statusLabel = project.status === "published" ? "Published" : "Draft";
    const today = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const display = summary ? formatProjectSummary(project.region, summary) : null;
    const notes = summary?.notes ?? [];

    return (
      <ReportPage
        ref={ref}
        logoBase64={logoBase64}
        projectName={project.name}
        pageNumber={pageNumber}
        totalPages={totalPages}
      >
        {/* Identity banner — compact, since this page now also carries the
            summary and notes sections below it. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          {logoBase64 && (
            <img
              src={logoBase64}
              alt="Ultra-Calc"
              style={{ height: "40px", width: "auto", objectFit: "contain" }}
            />
          )}
          <div>
            <div style={{ fontSize: "19px", fontWeight: 700, color: "#0f172a" }}>
              {project.name || "Untitled Project"}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Heat Loss &amp; Radiant Floor Design Report
            </div>
          </div>
        </div>

        {/* Project Information + Project Summary, side by side */}
        <div style={{ display: "flex", gap: "24px", marginBottom: "18px" }}>
          <div style={{ flex: 1 }}>
            <ReportSectionHeading>Project Information</ReportSectionHeading>
            <ReportRow label="Project Name" value={project.name} />
            <ReportRow label="Report Title" value="Heat Loss & Radiant Floor Design Report" />
            <ReportRow label="Address" value={project.address} />
            <ReportRow label="Contractor" value={project.contractor} />
            <ReportRow
              label="Heating System"
              value={getHeatingSystemLabel(project.heatingSystem)}
            />
            <ReportRow label="Region" value={regionLabel} />
            <ReportRow label="Standards" value={standardsLabel} />
            <ReportRow label="Project Status" value={statusLabel} />
            <ReportRow label="Room Count" value={project.rooms.length} />
            <ReportRow label="Report Date" value={today} />
            <ReportRow label="Created Date" value={formatDate(project.createdAt)} />
            <ReportRow label="Updated Date" value={formatDate(project.updatedAt)} />
          </div>

          <div style={{ flex: 1 }}>
            <ReportSectionHeading>Project Summary</ReportSectionHeading>
            {display ? (
              <>
                <ReportRow label="Total Heat Load" value={display.totalHeat} />
                <ReportRow label="Average Load Density" value={display.avgLoad} />
                <ReportRow
                  label="Required Water Temperature"
                  value={summary?.waterTempRange_C}
                />
                {project.heatingSystem === "HEAT_PUMP" &&
                  summary?.waterTempRange_C && (
                    <div
                      style={{
                        margin: "-2px 0 6px",
                        fontSize: "8.5px",
                        lineHeight: 1.35,
                        color: "#64748b",
                      }}
                    >
                      {HEAT_PUMP_WATER_TEMPERATURE_NOTE}
                    </div>
                  )}
                <ReportRow label="Total Tubing" value={display.tubing} />
                <ReportRow label="Total Loops" value={display.loops} />
                <ReportRow label="Total Ultra-Fins" value={display.fins} />
                <ReportRow label="Total Clips" value={display.clips} />
              </>
            ) : (
              <div style={{ fontSize: "10px", color: "#94a3b8", fontStyle: "italic" }}>
                No rooms added yet — summary will appear once the project has rooms.
              </div>
            )}
          </div>
        </div>

        {/* Project Notes — existing calculation warnings/recommendations,
            presented as-is (see useProjectSummary.ts's `notes` array). No
            new notes are generated here. */}
        <div>
          <ReportSectionHeading>Project Notes</ReportSectionHeading>
          {notes.length === 0 ? (
            <div style={{ fontSize: "10px", color: "#94a3b8", fontStyle: "italic" }}>
              No notes or warnings for this project.
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {notes.map((note, i) => (
                <li key={i} style={{ fontSize: "9.5px", color: "#334155", lineHeight: 1.4 }}>
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ReportPage>
    );
  },
);
