import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { Field } from "../forms/Field";
import { LayoutSVG } from "../layout/LayoutSVG";
import { Room, ProjectHeader, Method, RoomResults } from "../../models/projectTypes";
import {
  m2_to_ft2,
  ft_to_m,
  W_to_Btuh,
  Wpm2_to_Btuhft2,
  C_to_F,
  ft2_to_m2,
} from "../../utils/conversions";

interface RoomCardProps {
  room: Room;
  project: ProjectHeader;
  onUpdateRoom: (id: string, patch: Partial<Room>) => void;
  onRemoveRoom: (id: string) => void;
  computeRoom: (room: Room, period: string, project: ProjectHeader) => RoomResults;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  project,
  onUpdateRoom,
  onRemoveRoom,
  computeRoom,
}) => {
  const res: Partial<RoomResults> =
    computeRoom?.(room, project.period, project) ?? {};

  const {
    Q_W = 0,
    q_Wm2 = 0,
    spacing_in = 0,
    tubingSize = "",
    tubingLength_ft = 0,
    fins_count = 0,
    clips_count = 0,
    loops = 0,
    perLoop_ft = 0,
    waterC = 0,
    warnings = [],
  } = res;

  // --- Unit labels ---
  const lenLabel = project.units === "metric" ? "m" : "ft";
  const areaLabel = project.units === "metric" ? "m²" : "ft²";

  // --- Conversion helpers ---
  const toDisplayLength = (m: number) =>
    project.units === "metric" ? m : m * 3.28084;
  const fromDisplayLength = (v: number) =>
    project.units === "metric" ? v : ft_to_m(v);

  const toDisplayArea = (m2: number) =>
    project.units === "metric" ? m2 : m2_to_ft2(m2);
  const fromDisplayArea = (v: number) =>
    project.units === "metric" ? v : ft2_to_m2(v);

  // --- Result Displays ---
  const QDisp =
    project.units === "metric"
      ? `${Math.round(Q_W)} W`
      : `${Math.round(W_to_Btuh(Q_W))} Btu/h`;

  const QDensityDisp =
    project.units === "metric"
      ? `${res.q_Wm2?.toFixed(1)} W/m²`
      : `${Wpm2_to_Btuhft2(res.q_Wm2).toFixed(1)} Btu/h·ft²`;

  const LDisp =
    project.units === "metric"
      ? `${(tubingLength_ft * 0.3048).toFixed(1)} m`
      : `${Math.round(tubingLength_ft)} ft`;

  const waterTempDisplay =
    project.units === "metric"
      ? `${Math.round(waterC)} °C`
      : `${Math.round(C_to_F(waterC))} °F`;

  const areaVal =
    project.units === "metric"
      ? `${(room.length_m * room.width_m).toFixed(2)} m²`
      : `${m2_to_ft2(room.length_m * room.width_m).toFixed(1)} ft²`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white">
      {/* --- Input Card --- */}
      <SectionCard title={room.name}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Room Name">
            <input
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.name}
              onChange={(e) => onUpdateRoom(room.id, { name: e.target.value })}
            />
          </Field>

          {/* Length / Width / Height */}
          <Field label={`Length (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(room.length_m).toFixed(2)}
              onChange={(e) =>
                onUpdateRoom(room.id, { length_m: fromDisplayLength(+e.target.value) })
              }
            />
          </Field>

          <Field label={`Width (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(room.width_m).toFixed(2)}
              onChange={(e) =>
                onUpdateRoom(room.id, { width_m: fromDisplayLength(+e.target.value) })
              }
            />
          </Field>

          <Field label={`Height (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(room.height_m).toFixed(2)}
              onChange={(e) =>
                onUpdateRoom(room.id, { height_m: fromDisplayLength(+e.target.value) })
              }
            />
          </Field>

          <Field label={`Exterior Wall (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(room.exteriorLen_m).toFixed(2)}
              onChange={(e) =>
                onUpdateRoom(room.id, { exteriorLen_m: fromDisplayLength(+e.target.value) })
              }
            />
          </Field>

          <Field label={`Windows (${areaLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayArea(room.windowArea_m2).toFixed(2)}
              onChange={(e) =>
                onUpdateRoom(room.id, { windowArea_m2: fromDisplayArea(+e.target.value) })
              }
            />
          </Field>

          <Field label={`Doors (${areaLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayArea(room.doorArea_m2).toFixed(2)}
              onChange={(e) =>
                onUpdateRoom(room.id, { doorArea_m2: fromDisplayArea(+e.target.value) })
              }
            />
          </Field>

          {/* Ceiling / Floor Exposed */}
          <Field label="Ceiling Exposed">
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.ceilingExposed ? "1" : "0"}
              onChange={(e) =>
                onUpdateRoom(room.id, { ceilingExposed: e.target.value === "1" })
              }
            >
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </Field>

          <Field label="Floor Exposed">
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.floorExposed ? "1" : "0"}
              onChange={(e) =>
                onUpdateRoom(room.id, { floorExposed: e.target.value === "1" })
              }
            >
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </Field>

          <Field label="Install Method">
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.method}
              onChange={(e) =>
                onUpdateRoom(room.id, { method: e.target.value as Method })
              }
            >
              <option value="top">Top-Down</option>
              <option value="hangers">Hangers/Ultra-Clips</option>
              <option value="drilled">Drilled Joists</option>
              <option value="inslab">In-Slab</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">Area: {areaVal}</div>
          <button
            className="text-sm text-red-600 hover:underline"
            onClick={() => onRemoveRoom(room.id)}
          >
            Remove room
          </button>
        </div>
      </SectionCard>

      {/* --- Results --- */}
      <SectionCard title="Results">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-600">Total Heat Load</div>
          <div className="font-semibold text-right">{QDisp}</div>

          <div className="text-slate-600">Per-Area Load</div>
          <div className="font-semibold text-right">{QDensityDisp}</div>

          <div className="text-slate-600">Recommended Spacing</div>
          <div className="font-semibold text-right">
            {spacing_in}" — {tubingSize}
          </div>

          <div className="text-slate-600">Tubing Length</div>
          <div className="font-semibold text-right">{LDisp}</div>

          <div className="text-slate-600">Ultra-Fins</div>
          <div className="font-semibold text-right">
            {fins_count.toLocaleString()}
          </div>

          <div className="text-slate-600">Clips / Hangers</div>
          <div className="font-semibold text-right">
            {clips_count.toLocaleString()}
          </div>

          <div className="text-slate-600">Loops / Per-Loop</div>
          <div className="font-semibold text-right">
            {loops} loops ({perLoop_ft} ft/loop)
          </div>

          <div className="text-slate-600">Water Temp</div>
          <div className="font-semibold text-right">{waterTempDisplay}</div>
        </div>

        <div className="mt-4">
          <LayoutSVG
            method={room.method}
            length_m={room.length_m}
            width_m={room.width_m}
            spacing_in={spacing_in}
          />
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
            {warnings.map((w, i) => (
              <div key={i}>⚠ {w}</div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
