// src/components/export/MaterialsSummaryPage.tsx
//
// Per-room bill-of-materials table plus the existing project-wide totals
// (rendered via the unmodified SummaryCard). The per-room figures are
// produced by calling the same calculateRoom()/runUltraCalc() entry
// points already used by RoomCard, RoomLayoutExport, and
// useProjectSummary.ts for each room — this mirrors that established
// "recompute per usage site" pattern (see AGENTS.md §6) rather than
// introducing any new formula; every number here is one the app already
// produces elsewhere, just laid out as a consolidated table instead of
// one room at a time.
import React from "react";
import {
  ProjectSettings,
  RoomInput,
  ProjectSummary,
} from "../../models/projectTypes";
import { ReportPage } from "./ReportPage";
import { ReportSectionHeading } from "./reportPrimitives";
import { SummaryCard } from "../summary/SummaryCard";
import { calculateRoom } from "../../utils/physics";
import { runUltraCalc } from "../../utils/ultraCalcAdapter";
import { normalizeProjectSettings } from "../../utils/normalizeProject";
import { formatSpacing, formatTubeSizing } from "../../utils/formatResults";
import { getInstallMethodLabel } from "../../utils/formatProjectSummary";
import { toDisplayArea } from "../../utils/display";
import { getUIUnits } from "../../helpers/updateUiLabels";

interface Props {
  project: ProjectSettings & { rooms: RoomInput[] };
  summary: ProjectSummary | null;
  logoBase64: string | null;
  pageNumber: number;
  totalPages: number;
  /** Called once this page has mounted (and its ref is attached) — the BOM table is built synchronously via useMemo, so this page is ready as soon as it mounts. See src/utils/exportReadiness.ts. */
  onReady?: () => void;
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: "8.5px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  padding: "5px 6px",
  borderBottom: "1px solid #cbd5e1",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  fontSize: "9px",
  color: "#1e293b",
  padding: "5px 6px",
  borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
};

export const MaterialsSummaryPage = React.forwardRef<HTMLDivElement, Props>(
  ({ project, summary, logoBase64, pageNumber, totalPages, onReady }, ref) => {
    React.useEffect(() => {
      onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const uiUnits = getUIUnits(project.region);

    const rows = React.useMemo(() => {
      const normalizedProject = normalizeProjectSettings(project);
      return project.rooms.map((room) => {
        const res = calculateRoom(room, normalizedProject);
        const ultra = runUltraCalc(room, res, project);

        const tubingLength =
          uiUnits.length === "ft"
            ? `${ultra.materials.tubing_ft} ft`
            : `${ultra.materials.tubing_m} m`;

        const clips =
          (ultra.materials.hanging_supports ?? 0) +
          (ultra.materials.open_web_ultra_clips ?? 0) +
          (ultra.materials.topdown_ultra_clips ?? 0) +
          (ultra.materials.topdown_uc1212 ?? 0) +
          (ultra.materials.topdown_uc1234 ?? 0);

        const tubeSpacing = ultra.selection.spacingDisplayText
          ? ultra.selection.spacingDisplayText
          : ultra.selection.ultraFinSpacing_mm
            ? formatSpacing(project.region, ultra.selection.ultraFinSpacing_mm)
            : ultra.selection.tubingSpacing_mm
              ? formatSpacing(project.region, ultra.selection.tubingSpacing_mm)
              : "—";

        return {
          id: room.id,
          name: room.name || "Unnamed room",
          area: `${toDisplayArea(project.region, room.length_m * room.width_m)?.toFixed(2) ?? "—"} ${uiUnits.area}`,
          tubeSize: formatTubeSizing(project.region, ultra.selection.tubeSize),
          tubingLength,
          loops: ultra.materials.loops,
          fins_pairs: ultra.materials.fins_pairs,
          fin_halves: ultra.materials.fin_halves,
          clips,
          tubeSpacing,
          installMethod: getInstallMethodLabel(room.installMethod),
        };
      });
    }, [project, uiUnits.length, uiUnits.area]);

    return (
      <ReportPage
        ref={ref}
        logoBase64={logoBase64}
        projectName={project.name}
        pageLabel="Materials Summary"
        pageNumber={pageNumber}
        totalPages={totalPages}
      >
        <ReportSectionHeading>Bill of Materials — By Room</ReportSectionHeading>

        {rows.length === 0 ? (
          <div
            style={{
              fontSize: "10px",
              color: "#94a3b8",
              fontStyle: "italic",
              marginBottom: "16px",
            }}
          >
            No rooms added yet.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "18px",
            }}
          >
            <thead>
              <tr>
                <th style={th}>Room</th>
                <th style={th}>Area</th>
                <th style={th}>Tube Size</th>
                <th style={th}>Tubing Length</th>
                <th style={th}>Loops</th>
                <th style={th}>Ultra-Fins</th>
                <th style={th}>Clips</th>
                <th style={th}>Tube Spacing</th>
                <th style={th}>Install Method</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                  <td style={td}>{r.area}</td>
                  <td style={td}>{r.tubeSize}</td>
                  <td style={td}>{r.tubingLength}</td>
                  <td style={td}>{r.loops}</td>

                  <td style={td}>
                    {r.fins_pairs} pairs ({r.fin_halves} halves)
                  </td>
                  <td style={td}>{r.clips}</td>
                  <td style={td}>{r.tubeSpacing}</td>
                  <td style={td}>{r.installMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <SummaryCard project={project} summary={summary} />
      </ReportPage>
    );
  },
);
