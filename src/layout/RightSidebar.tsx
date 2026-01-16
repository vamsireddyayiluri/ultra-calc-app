import React from "react";
import { resolveSidebarAssets } from "./sidebarResolver";
import { InstallMethod } from "../utils/ultraCalcLocked";
import { Joist } from "./blockConstants";
import { inlineNestedSvgImages, loadImageAsBase64 } from "../utils/pdfExport";

interface SidebarImages {
  profiles: string[];
  supportIcon: string | null;
  joistLabel: string;
  label: string;
  isOpenWeb: boolean;
  installMethod?: InstallMethod;
}

interface Props {
  images: SidebarImages;
}

export const RightSidebar: React.FC<Props> = ({ images }) => {
  const { profiles, supportIcon, joistLabel, label, isOpenWeb, installMethod } =
    images;
  console.log("RightSidebar render", joistLabel);
  return (
    <div className="w-[120px] flex flex-col items-center text-center gap-2">
      {profiles &&
        profiles.map((src, i) => (
          <div key={i} className="flex flex-col items-center gap-1 mt-8">
            <img src={src} width={104} height={64} alt="" />
            <div className="text-[11px] text-gray-600">{joistLabel}</div>
          </div>
        ))}
      {installMethod === "INSLAB" && (
        <div className=" mt-8">
          <div className="text-[12px] text-gray-600">Tubing Spacing (C-C)</div>

          <div className="text-[11px] text-gray-600">{joistLabel}</div>
        </div>
      )}
      {!isOpenWeb && <div className="h-[64px]" />}

      {supportIcon && (
        <img src={supportIcon} width={48} height={48} className="mt-6" alt="" />
      )}

      <div className="text-xs font-semibold mt-1">{label}</div>
    </div>
  );
};
