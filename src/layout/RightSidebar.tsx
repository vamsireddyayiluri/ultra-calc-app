import React from "react";
import { InstallMethod } from "../utils/ultraCalcLocked";

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

  const isInSlab = installMethod === "INSLAB";

  /* ───────────────────────── NON IN-SLAB ───────────────────────── */
  if (!isInSlab) {
    return (
      <div className="w-[120px] flex flex-col items-center text-center gap-2">
        {/* Profiles */}
        {profiles?.map((src, i) => (
          <div key={i} className="flex flex-col items-center gap-1 mt-8">
            <img src={src} width={104} height={64} alt="" />
            <div className="text-[11px] text-gray-600">{joistLabel}</div>
          </div>
        ))}

        {/* Spacer for non–open web */}
        {!isOpenWeb && <div className="h-[64px]" />}

        {/* Support Icon + Label */}
        {supportIcon && (
          <img
            src={supportIcon}
            width={48}
            height={48}
            className="mt-6"
            alt=""
          />
        )}

        <div className="text-xs font-semibold mt-1">{label}</div>
      </div>
    );
  }

  /* ───────────────────────── IN-SLAB ───────────────────────── */
  return (
    <div className="w-[200px] ">
      <div className="text-[18px] text-gray-600 font-medium">
        Tubing Spacing
      </div>

      <div className="text-[14px] text-gray-600 font-medium mt-1">
        {joistLabel}
      </div>
    </div>
  );
};
