import React from "react";
import { Tile } from "./layoutTypes";

const SCALE = 1000; // meters → SVG units

interface Layout {
  tiles: Tile[];
  width: number;
  height: number;
}

interface Props {
  layout: Layout;
}

export const FloorLayoutSvg: React.FC<Props> = ({ layout }) => {
  return (
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
          href={t.asset}
          x={t.x * SCALE}
          y={t.y * SCALE}
          width={t.w * SCALE}
          height={t.h * SCALE}
        />
      ))}
    </svg>
  );
};
