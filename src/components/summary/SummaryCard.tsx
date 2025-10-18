import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { ProjectHeader } from "../../models/projectTypes";
import {
  W_to_Btuh,
  Wpm2_to_Btuhft2,
} from "../../utils/conversions";
import { SummaryRow } from "./SummaryRow";

interface ProjectSummary {
  totalW?: number;
  avg_Wm2?: number;
  totalTube_ft?: number;
  totalFins?: number;
  totalClips?: number;
  totalLoops?: number;
}

interface SummaryCardProps {
  project: ProjectHeader;
  summary: ProjectSummary | null;
}

/**
 * Displays total heat loss, tubing, fins, etc.
 * Works for both Metric and Imperial unit systems.
 */
export const SummaryCard: React.FC<SummaryCardProps> = ({
  project,
  summary,
}) => {
  const {
    totalW = 0,
    avg_Wm2 = 0,
    totalTube_ft = 0,
    totalFins = 0,
    totalClips = 0,
    totalLoops = 0,
  } = summary ?? {};

  const isMetric = project.units === "metric";

  const totalHeatDisplay = isMetric
    ? `${Math.round(totalW).toLocaleString()} W`
    : `${Math.round(W_to_Btuh(totalW)).toLocaleString()} Btu/h`;

  const avgHeatDisplay = isMetric
    ? `${avg_Wm2.toFixed(1)} W/m²`
    : `${Wpm2_to_Btuhft2(avg_Wm2).toFixed(1)} Btu/h·ft²`;

  const totalTubeDisplay = isMetric
    ? `${Math.round(totalTube_ft / 3.28084).toLocaleString()} m`
    : `${Math.round(totalTube_ft).toLocaleString()} ft`;

  return (
    <SectionCard title={`Project Summary (${isMetric ? "Metric" : "Imperial"})`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryRow
          label="🔥 Total Heat Load"
          value={totalHeatDisplay}
          highlight
        />
        <SummaryRow
          label="📏 Average Per-Area Load"
          value={avgHeatDisplay}
        />
        <SummaryRow
          label="🌀 Total Tubing"
          value={totalTubeDisplay}
        />
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
          value={totalLoops.toLocaleString()}
        />
      </div>
    </SectionCard>
  );
};