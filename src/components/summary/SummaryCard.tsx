import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { ProjectSettings, ProjectSummary } from "../../models/projectTypes";
import { W_to_Btuh, Wpm2_to_Btuhft2 } from "../../utils/conversions";
import { SummaryRow } from "./SummaryRow";

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

  const {
    totalW = 0,
    totalTubing_m = 0,
    totalFins = 0,
    totalClips = 0,
    totalLoops = 0,
    avg_Wm2 = 0,
  } = summary;

  const isMetric = project.unitMode === "metric";

  const totalHeatDisplay = isMetric
    ? `${Math.round(totalW).toLocaleString()} W`
    : `${Math.round(W_to_Btuh(totalW)).toLocaleString()} Btu/h`;

  const avgHeatDisplay = isMetric
    ? `${avg_Wm2.toFixed(1)} W/m²`
    : `${Wpm2_to_Btuhft2(avg_Wm2).toFixed(1)} Btu/h·ft²`;

  const totalTubeDisplay = isMetric
    ? `${Math.round(totalTubing_m).toLocaleString()} m`
    : `${Math.round(totalTubing_m * 3.28084).toLocaleString()} ft`;

  return (
    <SectionCard
      title={`Project Summary (${isMetric ? "Metric" : "Imperial"})`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryRow
          label="🔥 Total Heat Load"
          value={totalHeatDisplay}
          highlight
        />
        <SummaryRow label="📏 Average Per-Area Load" value={avgHeatDisplay} />
        <SummaryRow label="🌀 Total Tubing" value={totalTubeDisplay} />
        <SummaryRow
          label="🧩 Total Ultra-Fins"
          value={totalFins.toLocaleString()}
        />
        <SummaryRow
          label="🧷 Total Clips / Hangers"
          value={totalClips.toLocaleString()}
        />
        <SummaryRow
          label="🔁 Total Loops"
          value={(totalLoops ?? 0).toLocaleString()}
        />
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