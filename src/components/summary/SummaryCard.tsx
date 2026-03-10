import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { ProjectSettings, ProjectSummary } from "../../models/projectTypes";
import { SummaryRow } from "./SummaryRow";
import { getUIUnits } from "../../helpers/updateUiLabels";
import { formatProjectSummary } from "../../utils/formatProjectSummary";
import { formatSpacing } from "../../utils/formatResults";

interface SummaryCardProps {
  project: ProjectSettings;
  summary: ProjectSummary | null;
}

/**
 * Displays total heat load, tubing, fins, clips, etc.
 * Works for both Metric and Imperial systems.
 */
export const SummaryCard: React.FC<SummaryCardProps> = ({
  project,
  summary,
}) => {
  if (!summary)
    return (
      <SectionCard title="Project Summary">
        <p className="text-sm text-slate-500 italic">
          No summary data available.
        </p>
      </SectionCard>
    );

  const display = formatProjectSummary(project.region, summary);

  return (
    <SectionCard title={`Project Summary`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryRow
          label="🔥 Total Heat Load"
          value={display.totalHeat}
          highlight
        />

        <SummaryRow label="📏 Average Per-Area Load" value={display.avgLoad} />

        <SummaryRow label="🌀 Total Tubing" value={display.tubing} />

        <SummaryRow label="🧩 Total Ultra-Fins" value={display.fins} />
        <SummaryRow label="🧷 Total Clips / Hangers" value={display.clips} />
        <SummaryRow label="🔁 Total Loops" value={display.loops} />

        {/* ✅ NEW — Water Temperature Range */}
        {summary.waterTempRange_C && (
          <>
            <SummaryRow
              label="🌡 Required Water Temperature"
              value={`${Math.round(summary.avgWaterTemp_C)}°C (${Math.round((summary.avgWaterTemp_C * 9) / 5 + 32)}°F)`}
            />

            <div className="text-xs text-slate-500 mt-2">
              <strong>Typical Operating Range:</strong> 35–82°C (95–180°F).
              Actual operating temperature depends on outdoor conditions and
              heat load. Higher temperatures may be used if additional heat
              output is required.
            </div>
          </>
        )}

        {summary.ultraFinSpacing_mm && (
          <SummaryRow
            label="📐 Ultra-Fin Spacing (C-C)"
            value={
              summary.ultraFinSpacing_mm === "VARIES"
                ? "Varies by room"
                : formatSpacing(
                    project.region,
                    Number(summary.ultraFinSpacing_mm),
                  )
            }
          />
        )}

        {summary.tubingSpacing_mm && (
          <SummaryRow
            label="📏 Tubing Spacing (C-C)"
            value={
              summary.tubingSpacing_mm === "VARIES"
                ? "Varies by room"
                : formatSpacing(
                    project.region,
                    Number(summary.tubingSpacing_mm),
                  )
            }
          />
        )}
      </div>

      {summary.notes && summary.notes.length > 0 && (
        <div className="mt-4 border-t pt-3 text-sm text-slate-600">
          <h4 className="font-semibold mb-1">Notes</h4>
          <ul className="list-disc ml-5">
            {summary.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
};
