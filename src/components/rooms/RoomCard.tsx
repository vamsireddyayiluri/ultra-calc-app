import React from "react";
import { SectionCard } from "../layout/SectionCard";
import { Field } from "../forms/Field";
import { LayoutSVG } from "../layout/LayoutSVG";
import {
  RoomInput,
  ProjectSettings,
  RoomResults,
  InstallMethod,
  JoistSpacingOption,
  FloorCoverKey,
} from "../../models/projectTypes";
import {
  m2_to_ft2,
  ft_to_m,
  W_to_Btuh,
  Wpm2_to_Btuhft2,
  C_to_F,
  ft2_to_m2,
} from "../../utils/conversions";

// --- Safe parse utility ---
function safeParseNumber(value: string): number | undefined {
  if (value === "" || value === "-") return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

interface RoomCardProps {
  room: RoomInput;
  project: ProjectSettings;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;
  onRemoveRoom: (id: string) => void;
  calculateRoom: (room: RoomInput, project: ProjectSettings) => RoomResults;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  project,
  onUpdateRoom,
  onRemoveRoom,
  calculateRoom,
}) => {
  const res = React.useMemo(
    () => calculateRoom(room, project),
    [room, project, project.unitMode]
  );

  const {
    qFabric_W,
    qVent_W,
    qGround_W,
    qPsi_W,
    qAfterFactors_W,
    load_W_per_m2,
    spacing_in,
    tubeSize_in,
    tubingLength_m,
    fins_qty,
    clips_qty,
    loops_qty,
    perLoopLength_m,
    waterTemp_C,
    warnings,
    floorCover_R_m2K_per_W,
    floorCover_U_W_per_m2K,
  } = res;

  // --- Unit labels ---
  const lenLabel = project.unitMode === "metric" ? "m" : "ft";
  const areaLabel = project.unitMode === "metric" ? "m²" : "ft²";

  const toDisplayLength = (m: number) =>
    project.unitMode === "metric" ? m : m * 3.28084;
  const fromDisplayLength = (v: number) =>
    project.unitMode === "metric" ? v : ft_to_m(v);

  const toDisplayArea = (m2: number) =>
    project.unitMode === "metric" ? m2 : m2_to_ft2(m2);
  const fromDisplayArea = (v: number) =>
    project.unitMode === "metric" ? v : ft2_to_m2(v);

  // --- Display formatting ---
  const QDisp =
    project.unitMode === "metric"
      ? `${Math.round(qAfterFactors_W)} W`
      : `${Math.round(W_to_Btuh(qAfterFactors_W))} Btu/h`;

  const QDensityDisp =
    project.unitMode === "metric"
      ? `${load_W_per_m2.toFixed(1)} W/m²`
      : `${Wpm2_to_Btuhft2(load_W_per_m2).toFixed(1)} Btu/h·ft²`;

  const LDisp =
    project.unitMode === "metric"
      ? `${tubingLength_m.toFixed(1)} m`
      : `${Math.round(tubingLength_m * 3.28084)} ft`;

  const waterTempDisplay =
    project.unitMode === "metric"
      ? `${Math.round(waterTemp_C)} °C`
      : `${Math.round(C_to_F(waterTemp_C))} °F`;

  const areaVal =
    project.unitMode === "metric"
      ? `${(room.length_m * room.width_m).toFixed(2)} m²`
      : `${m2_to_ft2(room.length_m * room.width_m).toFixed(1)} ft²`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white">
      {/* --- Room Inputs --- */}
      <SectionCard title={room.name}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Room Name */}
          <Field label="Room Name">
            <input
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.name}
              onChange={(e) =>
                onUpdateRoom(room.name, { name: e.target.value })
              }
            />
          </Field>

          {/* Setpoint */}
          <Field label="Setpoint Temp (°C)">
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.setpointC ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRoom(room.name, {
                  setpointC: val === "" ? undefined : safeParseNumber(val),
                });
              }}
            />
          </Field>

          {/* Length */}
          <Field label={`Length (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={
                room.length_m !== undefined
                  ? toDisplayLength(room.length_m)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRoom(room.name, {
                  length_m:
                    val === "" ? undefined : fromDisplayLength(Number(val)),
                });
              }}
            />
          </Field>

          {/* Width */}
          <Field label={`Width (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={
                room.width_m !== undefined ? toDisplayLength(room.width_m) : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRoom(room.name, {
                  width_m:
                    val === "" ? undefined : fromDisplayLength(Number(val)),
                });
              }}
            />
          </Field>

          {/* Height */}
          <Field label={`Height (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={
                room.height_m !== undefined
                  ? toDisplayLength(room.height_m)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                onUpdateRoom(room.name, {
                  height_m:
                    val === "" ? undefined : fromDisplayLength(Number(val)),
                });
              }}
            />
          </Field>

          {/* Exterior Wall */}
          <Field label={`Exterior Wall (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={
                room.exteriorLen_m !== undefined
                  ? toDisplayLength(room.exteriorLen_m)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                const parsed = safeParseNumber(val);
                onUpdateRoom(room.name, {
                  exteriorLen_m:
                    val === "" || parsed === undefined
                      ? undefined
                      : fromDisplayLength(parsed),
                });
              }}
            />
          </Field>

          {/* Windows */}
          <Field label={`Windows (${areaLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={
                room.windowArea_m2 !== undefined
                  ? toDisplayArea(room.windowArea_m2)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                const parsed = safeParseNumber(val);
                onUpdateRoom(room.name, {
                  windowArea_m2:
                    val === "" || parsed === undefined
                      ? undefined
                      : fromDisplayArea(parsed),
                });
              }}
            />
          </Field>

          {/* Doors */}
          <Field label={`Doors (${areaLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={
                room.doorArea_m2 !== undefined
                  ? toDisplayArea(room.doorArea_m2)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                const parsed = safeParseNumber(val);
                onUpdateRoom(room.name, {
                  doorArea_m2:
                    val === "" || parsed === undefined
                      ? undefined
                      : fromDisplayArea(parsed),
                });
              }}
            />
          </Field>

          {/* Joist Spacing */}
          <Field label="Joist Spacing">
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.joistSpacing ?? ""}
              onChange={(e) =>
                onUpdateRoom(room.name, {
                  joistSpacing: e.target.value as JoistSpacingOption,
                })
              }
            >
              <option value="">Select</option>
              <option value="16in_400mm">16" / 400mm</option>
              <option value="19in_488mm">19" / 488mm</option>
              <option value="24in_600mm">24" / 600mm</option>
            </select>
          </Field>

          {/* Floor Cover */}
          <Field label="Floor Cover">
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.floorCover ?? ""}
              onChange={(e) =>
                onUpdateRoom(room.name, {
                  floorCover: e.target.value as FloorCoverKey,
                })
              }
            >
              <option value="">Select</option>
              <option value="tile_stone">Tile / Stone</option>
              <option value="vinyl_lvt">Vinyl / LVT</option>
              <option value="laminate">Laminate</option>
              <option value="engineered_wood">Engineered Wood</option>
              <option value="solid_wood">Solid Wood</option>
              <option value="carpet_low_pad">Carpet (Low Pad)</option>
              <option value="carpet_high_pad">Carpet (High Pad)</option>
            </select>
          </Field>

          {/* Install Method */}
          <Field label="Install Method">
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={room.installMethod}
              onChange={(e) =>
                onUpdateRoom(room.name, {
                  installMethod: e.target.value as InstallMethod,
                })
              }
            >
              <option value="top">Top-Down</option>
              <option value="hangers">Hangers</option>
              <option value="drilled">Drilled Joists</option>
              <option value="inslab">In-Slab</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">Area: {areaVal}</div>
          <button
            className="text-sm text-red-600 hover:underline"
            onClick={() => onRemoveRoom(room.name)}
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

          <div className="text-slate-600">Fabric Loss</div>
          <div className="text-right">
            {project.unitMode === "metric"
              ? `${Math.round(qFabric_W)} W`
              : `${Math.round(W_to_Btuh(qFabric_W))} Btu/h`}
          </div>

          <div className="text-slate-600">Ventilation Loss</div>
          <div className="text-right">
            {project.unitMode === "metric"
              ? `${Math.round(qVent_W)} W`
              : `${Math.round(W_to_Btuh(qVent_W))} Btu/h`}
          </div>

          <div className="text-slate-600">Ground Loss</div>
          <div className="text-right">
            {project.unitMode === "metric"
              ? `${Math.round(qGround_W)} W`
              : `${Math.round(W_to_Btuh(qGround_W))} Btu/h`}
          </div>

          <div className="text-slate-600">Psi Loss</div>
          <div className="text-right">
            {project.unitMode === "metric"
              ? `${Math.round(qPsi_W)} W`
              : `${Math.round(W_to_Btuh(qPsi_W))} Btu/h`}
          </div>

          <div className="text-slate-600">Recommended Spacing</div>
          <div className="font-semibold text-right">
            {spacing_in}" — {tubeSize_in}"
          </div>

          <div className="text-slate-600">Tubing Length</div>
          <div className="font-semibold text-right">{LDisp}</div>

          <div className="text-slate-600">Water Temp</div>
          <div className="font-semibold text-right">{waterTempDisplay}</div>

          <div className="text-slate-600">Floor Cover R / U</div>
          <div className="font-semibold text-right">
            R={floorCover_R_m2K_per_W?.toFixed(3)} / U=
            {floorCover_U_W_per_m2K?.toFixed(3)}
          </div>

          <div className="text-slate-600">Ultra-Fins</div>
          <div className="text-right">{fins_qty}</div>

          <div className="text-slate-600">Clips</div>
          <div className="text-right">{clips_qty}</div>

          <div className="text-slate-600">Loops / Per-Loop</div>
          <div className="text-right">
            {loops_qty} ({perLoopLength_m.toFixed(1)} m/loop)
          </div>
        </div>

        <div className="mt-4">
          <LayoutSVG
            method={room.installMethod}
            length_m={room.length_m}
            width_m={room.width_m}
            spacing_in={spacing_in}
          />
        </div>

        {warnings?.length > 0 && (
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
