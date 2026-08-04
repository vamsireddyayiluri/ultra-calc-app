import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { ProjectSettings, ProjectSummary } from "../../models/projectTypes";
import { SummaryRow } from "./SummaryRow";
import { formatProjectSummary } from "../../utils/formatProjectSummary";
import { formatSpacing } from "../../utils/formatResults";

interface SummaryCardProps {
  project: ProjectSettings;
  summary: ProjectSummary | null;
}

/** A hero stat — for the one or two numbers that matter most, set apart from the rest of the summary instead of sitting in a list of equally-weighted rows. */
const SummaryStat: React.FC<{
  label: string;
  value: string;
  tone: "primary" | "accent";
}> = ({ label, value, tone }) => (
  <div
    className={`rounded-xl border p-4 ${
      tone === "primary"
        ? "border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100"
        : "border-sky-200 bg-gradient-to-br from-sky-50 to-sky-100"
    }`}
  >
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div
      className={`mt-1 text-2xl font-bold ${
        tone === "primary" ? "text-blue-800" : "text-sky-800"
      }`}
    >
      {value}
    </div>
  </div>
);

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
    <SectionCard title="Project Summary">
      {/* The two numbers that matter most at a glance — everything else
          is supporting detail. Previously all 6-9 values sat in one
          equally-weighted grid with only Total Heat visually singled
          out; Required Water Temperature is just as decision-relevant
          (it's what the boiler/manifold gets set to) but had no more
          visual weight than "Total Loops". */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryStat label="Total Heat Load" value={display.totalHeat} tone="primary" />
        {summary.waterTempRange_C && (
          <SummaryStat
            label="Required Water Temperature"
            value={summary.waterTempRange_C}
            tone="accent"
          />
        )}
      </div>

      {summary.waterTempRange_C && (
        <p className="mt-2 text-xs text-slate-500">
          Typical operating range: 35–82°C (95–180°F). Actual operating
          temperature depends on outdoor conditions and heat load. Higher
          temperatures may be used if additional heat output is required.
        </p>
      )}

      <h3 className="mb-2 mt-6 border-t border-slate-100 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Materials &amp; Installation
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryRow label="Average Per-Area Load" value={display.avgLoad} />
        <SummaryRow label="Total Tubing" value={display.tubing} />
        <SummaryRow label="Total Ultra-Fins" value={display.fins} />
        <SummaryRow label="Total Clips / Hangers" value={display.clips} />
        <SummaryRow label="Total Loops" value={display.loops} />

        {summary.ultraFinSpacing_mm && (
          <SummaryRow
            label="Ultra-Fin Spacing (C-C)"
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
            label="Tubing Spacing (C-C)"
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
