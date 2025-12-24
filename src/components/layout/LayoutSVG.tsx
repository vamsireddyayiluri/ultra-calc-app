import { InstallMethod } from "../../models/projectTypes";
import { ft_to_m } from "../../utils/conversions";

export function LayoutSVG({ method, length_m, width_m, spacing_in }: {
  method: InstallMethod; length_m: number; width_m: number; spacing_in: number;
}) {
  // scale to 360x240 viewbox
  const VB_W = 360;
  const VB_H = 240;
  const maxDim = Math.max(length_m, width_m) || 1;
  const sx = (VB_W - 20) / maxDim;
  const sy = (VB_H - 20) / maxDim;
  const scale = Math.min(sx, sy);
  const pad = 10;

  // Draw parallel runs based on spacing (convert to meters)
  const spacing_m = ft_to_m(spacing_in / 12);
  const runs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (method === "inslab") {
    // grid (horizontal lines)
    for (let y = 0; y <= width_m; y += spacing_m) {
      runs.push({
        x1: pad,
        y1: pad + y * scale,
        x2: pad + length_m * scale,
        y2: pad + y * scale,
      });
    }
  } else {
    // joist-parallel (vertical lines)
    for (let x = 0; x <= length_m; x += spacing_m) {
      runs.push({
        x1: pad + x * scale,
        y1: pad,
        x2: pad + x * scale,
        y2: pad + width_m * scale,
      });
    }
  }

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto rounded-lg border border-slate-200">
      {/* room outline */}
      <rect
        x={pad}
        y={pad}
        width={length_m * scale}
        height={width_m * scale}
        fill="#f8fafc"
        stroke="#94a3b8"
      />
      {/* tubing runs */}
      {runs.map((r, i) => (
        <line
          key={i}
          x1={r.x1}
          y1={r.y1}
          x2={r.x2}
          y2={r.y2}
          stroke="#0ea5e9"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.9}
        />
      ))}
      {/* method label */}
      <text x={VB_W - 8} y={VB_H - 8} textAnchor="end" fontSize={10} fill="#475569">
        {method.toUpperCase()} — {spacing_in}" ctrs
      </text>
    </svg>
  );
}

