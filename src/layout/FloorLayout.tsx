import React from "react";
import { Tile } from "./layoutTypes";

interface Props {
  tiles: Tile[];
  width: number;
  height: number;
}

export const FloorLayoutSvg: React.FC<Props> = ({ tiles, width, height }) => {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      preserveAspectRatio="xMinYMin meet"
    >
      {tiles.map((t, i) => (
        <image
          key={i}
          href={t.asset}
          x={t.x}
          y={t.y}
          width="100%"
          height="100%"
        />
      ))}
    </svg>
  );
};
