import React from "react";
import { Tile } from "./layoutTypes";
import { InstallMethod } from "../models/projectTypes";

export const SCALE = 1000; // meters → SVG units

interface Layout {
  tiles: Tile[];
  width: number;
  height: number;
}

interface Props {
  layout: Layout;
  installMethod?: InstallMethod;
}

export const FloorLayoutSvg: React.FC<Props> = ({ layout, installMethod }) => {
  if (installMethod === "INSLAB") {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <span className="text-sm font-medium text-slate-500">
          Layout diagram not available
        </span>
        <span className="text-xs text-slate-400">
          In-slab installs don&apos;t have a fin/tubing layout drawing.
        </span>
      </div>
    );
  }

  // The room's own proportions (matching the viewBox's +1 padding on each
  // axis) — used to give this box a definite, intrinsic height instead of
  // relying on `height: 100%` resolving against an ancestor that only
  // ever specifies a min-height. Percentage heights against an
  // indefinite-height ancestor are handled inconsistently across
  // rendering engines (some derive a height from the SVG's own
  // viewBox/intrinsic ratio as a fallback, some don't).
  //
  // Deliberately using the classic "padding-top percentage" box (not the
  // native CSS `aspect-ratio` property): percentage padding is always
  // resolved against the containing block's WIDTH — even for
  // padding-top/bottom, a long-standing CSS quirk that predates
  // `aspect-ratio` by well over a decade and is universally supported,
  // including on mobile browsers too old to support `aspect-ratio`
  // (shipped March 2022 on iOS Safari). This removes the ambiguity
  // outright, on every device, without hardcoding any fixed pixel width
  // or height.
  const ratioPercent = ((layout.height + 1) / (layout.width + 1)) * 100;

  return (
    <>
      <svg
        viewBox={`
        ${-SCALE * 0.5}
        ${-SCALE * 0.5}
        ${(layout.width + 1) * SCALE}
        ${(layout.height + 1) * SCALE}
      `}
        width="100%"
        height="100%"
        preserveAspectRatio="xMinYMin meet"
      >
        {layout.tiles.map((t, i) => (
          <image
            key={i}
            href={t.assetBase64 ?? t.asset}
            x={t.x * SCALE}
            y={t.y * SCALE}
            width={Math.max(1, t.w * SCALE)}
            height={Math.max(1, t.h * SCALE)}
            preserveAspectRatio="xMidYMid meet"
          />
        ))}
      </svg>
    </>
  );
};
