// src/components/export/DesignParametersPage.tsx
//
// Documents the design assumptions/inputs behind this report's
// calculations — every value here is read directly from `project` using
// the same display/unit-conversion functions ProjectForm's "Advanced
// Defaults" panel already uses (toDisplayTemperature, toDisplayPsiAllowance,
// toDisplayVentilation, toDisplayUValue). Nothing is recalculated.
import React from "react";
import { MaterialUValues, ProjectSettings, RoomInput } from "../../models/projectTypes";
import { ReportPage } from "./ReportPage";
import { ReportRow, ReportSectionHeading } from "./reportPrimitives";
import { REGION_OPTIONS } from "../../models/presets";
import { STANDARDS_OPTIONS } from "../forms/ProjectForm";
import { getUIUnits } from "../../helpers/updateUiLabels";
import {
  toDisplayPsiAllowance,
  toDisplayTemperature,
  toDisplayUValue,
  toDisplayVentilation,
} from "../../utils/display";

interface Props {
  project: ProjectSettings & { rooms: RoomInput[] };
  logoBase64: string | null;
  pageNumber: number;
  totalPages: number;
  /** Called once this page has mounted (and its ref is attached) — this page has no async loading of its own, so it reports ready immediately. See src/utils/exportReadiness.ts. */
  onReady?: () => void;
}

const U_VALUE_LABELS: Record<keyof MaterialUValues, string> = {
  wall: "Wall U-Value",
  window: "Window U-Value",
  door: "Door U-Value",
  roof: "Roof U-Value",
  floor: "Floor U-Value",
};

export const DesignParametersPage = React.forwardRef<HTMLDivElement, Props>(
  ({ project, logoBase64, pageNumber, totalPages, onReady }, ref) => {
    React.useEffect(() => {
      onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const uiUnits = getUIUnits(project.region);
    const regionLabel =
      REGION_OPTIONS.find((o) => o.key === project.region)?.label ??
      project.region;
    const standardsLabel =
      STANDARDS_OPTIONS.find((o) => o.key === project.standardsMode)?.label ??
      project.standardsMode;

    // "Ground Floor Setting" is a per-room field (RoomInput.floorOnGround),
    // not a single project-level setting — this rolls up the existing
    // per-room values into one line rather than inventing a new
    // project-level field.
    const groundRoomCount = project.rooms.filter((r) => r.floorOnGround).length;

    const customUEntries = (
      Object.keys(U_VALUE_LABELS) as (keyof MaterialUValues)[]
    ).filter((key) => project.customUOverrides?.[key] != null);

    return (
      <ReportPage
        ref={ref}
        logoBase64={logoBase64}
        projectName={project.name}
        pageLabel="Design Parameters"
        pageNumber={pageNumber}
        totalPages={totalPages}
      >
        <p style={{ fontSize: "10px", color: "#64748b", marginBottom: "16px", lineHeight: 1.5 }}>
          The values below document the design assumptions and inputs used to
          produce the heat loss and material sizing results in this report.
        </p>

        <div style={{ display: "flex", gap: "24px" }}>
          <div style={{ flex: 1 }}>
            <ReportSectionHeading>Region &amp; Standards</ReportSectionHeading>
            <ReportRow label="Region" value={regionLabel} />
            <ReportRow label="Standards" value={standardsLabel} />

            <ReportSectionHeading style={{ marginTop: "18px" }}>
              Design Temperatures
            </ReportSectionHeading>
            <ReportRow
              label="Indoor Temperature"
              value={`${toDisplayTemperature(project.region, project.indoorTempC) ?? "—"} ${uiUnits.temperature}`}
            />
            <ReportRow
              label="Outdoor Temperature"
              value={`${toDisplayTemperature(project.region, project.outdoorTempC) ?? "—"} ${uiUnits.temperature}`}
            />
          </div>

          <div style={{ flex: 1 }}>
            <ReportSectionHeading>Calculation Factors</ReportSectionHeading>
            <ReportRow
              label="Safety Factor"
              value={project.safetyFactorPct != null ? `${project.safetyFactorPct.toFixed(1)}%` : undefined}
            />
            <ReportRow
              label="Heat-up Factor"
              value={project.heatUpFactorPct != null ? `${project.heatUpFactorPct.toFixed(1)}%` : undefined}
            />
            <ReportRow
              label="Psi Allowance"
              value={
                project.psiAllowance_W_per_K != null
                  ? `${toDisplayPsiAllowance(project.region, project.psiAllowance_W_per_K)} ${uiUnits.psi}`
                  : undefined
              }
            />
            <ReportRow
              label="Ventilation Rate"
              value={
                project.mechVent_m3_per_h != null
                  ? `${toDisplayVentilation(project.region, project.mechVent_m3_per_h)} ${uiUnits.ventilation}`
                  : undefined
              }
            />
            <ReportRow
              label="Air Changes (ACH)"
              value={project.infiltrationACH != null ? project.infiltrationACH.toFixed(2) : undefined}
            />
            <ReportRow
              label="Ground Floor Setting"
              value={`${groundRoomCount} of ${project.rooms.length} room${project.rooms.length === 1 ? "" : "s"}`}
            />
          </div>
        </div>

        {customUEntries.length > 0 && (
          <div style={{ marginTop: "22px" }}>
            <ReportSectionHeading>Custom U-Values</ReportSectionHeading>
            <div style={{ display: "flex", gap: "24px" }}>
              <div style={{ flex: 1 }}>
                {customUEntries
                  .slice(0, Math.ceil(customUEntries.length / 2))
                  .map((key) => (
                    <ReportRow
                      key={key}
                      label={U_VALUE_LABELS[key]}
                      value={`${toDisplayUValue(project.region, project.customUOverrides?.[key])} ${uiUnits.uValue}`}
                    />
                  ))}
              </div>
              <div style={{ flex: 1 }}>
                {customUEntries
                  .slice(Math.ceil(customUEntries.length / 2))
                  .map((key) => (
                    <ReportRow
                      key={key}
                      label={U_VALUE_LABELS[key]}
                      value={`${toDisplayUValue(project.region, project.customUOverrides?.[key])} ${uiUnits.uValue}`}
                    />
                  ))}
              </div>
            </div>
          </div>
        )}
      </ReportPage>
    );
  },
);
