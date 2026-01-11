// src/components/materials/MaterialsCard.tsx
import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { UltraCalcOutput } from "../../utils/ultraCalcLocked";
import { getUIUnits } from "../../helpers/updateUiLabels";
import { ProjectSettings } from "../../models/projectTypes";

interface MaterialsCardProps {
  ultra: UltraCalcOutput;
  project: ProjectSettings;
}

export const MaterialsCard: React.FC<MaterialsCardProps> = ({
  ultra,
  project,
}) => {
  const { materials, selection } = ultra;
  const uiUnits = getUIUnits(project.region);
  console.log(selection)

  return (
    <SectionCard title="Materials (Ultra-Calc)">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-slate-600">Install Method</div>
        <div className="text-right font-semibold">{selection.method}</div>

        <div className="text-slate-600">Tube Size</div>
        <div className="text-right">{selection.tubeSize}</div>

        <div className="text-slate-600">Tubing Length</div>
        <div className="text-right font-semibold">
          {uiUnits.length === "ft"
            ? `${materials.tubing_ft} ft`
            : `${materials.tubing_m} m`}
        </div>

        <div className="text-slate-600">Loops</div>
        <div className="text-right">
          {materials.loops} (
          {uiUnits.length === "ft"
            ? `${materials.ft_per_loop} ft`
            : `${materials.m_per_loop.toFixed(1)} m`}
          /loop)
        </div>

        <div className="text-slate-600">Ultra-Fins</div>
        <div className="text-right">
          {materials.fins_pairs} pairs ({materials.fin_halves} halves)
        </div>

        {materials.hanging_supports != null && (
          <>
            <div className="text-slate-600">Hanging Supports</div>
            <div className="text-right">{materials.hanging_supports}</div>
          </>
        )}

        {materials.open_web_ultra_clips != null && (
          <>
            <div className="text-slate-600">Open-Web Ultra-Clips</div>
            <div className="text-right">{materials.open_web_ultra_clips}</div>
          </>
        )}

        {materials.topdown_ultra_clips != null && (
          <>
            <div className="text-slate-600">Top-Down Ultra-Clips</div>
            <div className="text-right">{materials.topdown_ultra_clips}</div>
          </>
        )}

        {materials.topdown_uc1212 != null && (
          <>
            <div className="text-slate-600">UC1212 Clips</div>
            <div className="text-right">{materials.topdown_uc1212}</div>
          </>
        )}
      </div>
      

      {selection.supplementalWarning && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
          🔥 Add Supplemental Heat Recommended
        </div>
      )}
    </SectionCard>
  );
};
