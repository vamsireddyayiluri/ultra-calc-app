// src/layout/LayoutLegend.tsx
//
// Purely presentational — reads the `type` field already present on each
// Tile (src/layout/layoutTypes.ts) and renders a plain-English key. Does
// not compute, resolve, or invent anything about the layout; only the
// types of tiles actually present in this room's layout are shown.
import React from "react";
import { Tile, TileType } from "./layoutTypes";

interface Props {
  tiles: Tile[];
}

const LEGEND_META: Record<
  TileType,
  { label: string; description: string; swatchClass: string }
> = {
  FB: {
    label: "Fin Block",
    description: "Ultra-Fin panel section",
    swatchClass: "bg-teal-500",
  },
  PB: {
    label: "Pipe Bridge",
    description: "Tubing bridge / connector",
    swatchClass: "bg-amber-500",
  },
  EC: {
    label: "End Cap",
    description: "Loop end termination",
    swatchClass: "bg-slate-500",
  },
};

export const LayoutLegend: React.FC<Props> = ({ tiles }) => {
  const typesPresent = Array.from(
    new Set(tiles.map((t) => t.type)),
  ) as TileType[];

  if (typesPresent.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Legend
      </span>
      {typesPresent.map((type) => {
        const meta = LEGEND_META[type];
        return (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${meta.swatchClass}`}
            />
            <span className="font-medium text-slate-700">{meta.label}</span>
            <span className="text-slate-400">— {meta.description}</span>
          </span>
        );
      })}
    </div>
  );
};
