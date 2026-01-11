// src/components/rooms/RoomCard.tsx
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
import { getUIUnits } from "../../helpers/updateUiLabels";
import { normalizeProjectSettings } from "../../utils/normalizeProject";
import { formatRoomResults } from "../../utils/formatRoomResults";
import {
  fromDisplayArea,
  fromDisplayLength,
  fromDisplayTemperature,
  toDisplayArea,
  toDisplayLength,
  toDisplayTemperature,
} from "../../utils/display";
import { runUltraCalc } from "../../utils/ultraCalcAdapter";
import { INSTALL_METHOD_OPTIONS } from "../../models/presets";
import { getInstallMethodLabel } from "../../utils/formatProjectSummary";
import { buildLayout } from "../../layout/layoutEngine";
import { FloorLayoutSvg } from "../../layout/FloorLayoutSvg";

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
  const normalizedProject = normalizeProjectSettings(project);

  const res = React.useMemo(
    () => calculateRoom(room, normalizedProject),
    [room, project]
  );
  const ultra = React.useMemo(
    () => runUltraCalc(room, res, project),
    [room, res, project]
  );
  const layout = buildLayout({
    roomLength_m: room.length_m!,
    roomWidth_m: room.width_m!,
    joist: room.joistSpacing!,
    load: ultra.selection.mode === "LL" ? "LL" : "HL",
    method: ultra.selection.method,
  });

  const uiUnits = getUIUnits(project.region);
  const lenLabel = uiUnits.length;
  const areaLabel = uiUnits.area;
  const display = formatRoomResults(project.region, res);
  // const areaVal = `${(room.length_m * room.width_m).toFixed(2)} ${
  //   uiUnits.area
  // }`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white">
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
          <Field label={`Setpoint Temp (${uiUnits.temperature})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayTemperature(project.region, room.setpointC) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  setpointC: fromDisplayTemperature(project.region, raw),
                });
              }}
            />
          </Field>

          {/* Length */}
          <Field label={`Length (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(project.region, room.length_m) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  length_m: fromDisplayLength(project.region, raw),
                });
              }}
            />
          </Field>

          {/* Width */}
          <Field label={`Width (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(project.region, room.width_m) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  width_m: fromDisplayLength(project.region, raw),
                });
              }}
            />
          </Field>

          {/* Height */}
          <Field label={`Height (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(project.region, room.height_m) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  height_m: fromDisplayLength(project.region, raw),
                });
              }}
            />
          </Field>

          {/* Exterior Wall */}
          <Field label={`Exterior Wall (${lenLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayLength(project.region, room.exteriorLen_m) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  exteriorLen_m: fromDisplayLength(project.region, raw),
                });
              }}
            />
          </Field>

          {/* Windows */}
          <Field label={`Windows (${areaLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayArea(project.region, room.windowArea_m2) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  windowArea_m2: fromDisplayArea(project.region, raw),
                });
              }}
            />
          </Field>

          {/* Doors */}
          <Field label={`Doors (${areaLabel})`}>
            <input
              type="number"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={toDisplayArea(project.region, room.doorArea_m2) ?? ""}
              onChange={(e) => {
                const raw =
                  e.target.value === "" ? undefined : Number(e.target.value);
                onUpdateRoom(room.name, {
                  doorArea_m2: fromDisplayArea(project.region, raw),
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
                  joistSpacing: Number(e.target.value) as JoistSpacingOption,
                })
              }
            >
              <option value="">Select</option>
              <option value={12}>12" (300 mm)</option>
              <option value={16}>16" (400 mm)</option>
              <option value={19}>19" (488 mm)</option>
              <option value={24}>24" (600 mm)</option>
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
              value={room.installMethod ?? ""}
              onChange={(e) =>
                onUpdateRoom(room.name, {
                  installMethod: e.target.value as InstallMethod,
                })
              }
            >
              <option value="">Select</option>

              {INSTALL_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Area:{" "}
            {toDisplayArea(
              project.region,
              room.length_m * room.width_m
            )?.toFixed(2)}{" "}
            {uiUnits.area}
          </div>
          <button
            className="text-sm text-red-600 hover:underline"
            onClick={() => onRemoveRoom(room.name)}
          >
            Remove room
          </button>
        </div>
      </SectionCard>

      {/* -------- Physics Results -------- */}
      <SectionCard title="Results & Materials">
        {/* ---------------- Heat Loss Results ---------------- */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Heat Loss Results
          </h4>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Total Heat</div>
            <div className="text-right font-semibold">{display.totalHeat}</div>

            <div>Load Density</div>
            <div className="text-right">{display.loadDensity}</div>

            <div>Fabric</div>
            <div className="text-right">{display.qFabric}</div>

            <div>Ventilation</div>
            <div className="text-right">{display.qVent}</div>

            <div>Psi</div>
            <div className="text-right">{display.qPsi}</div>

            <div>Ground</div>
            <div className="text-right">{display.qGround}</div>

            <div>Water Temp</div>
            <div className="text-right font-semibold">{display.waterTemp}</div>
          </div>

          {res.warnings?.length > 0 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border rounded-md p-2">
              {res.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- Materials (Ultra-Calc) ---------------- */}
        <div className="border-t border-slate-200 pt-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Materials (Ultra-Calc)
          </h4>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-600">Install Method</div>
            <div className="text-right font-semibold">
              {getInstallMethodLabel(room.installMethod)}
            </div>

            <div className="text-slate-600">Tube Size</div>
            <div className="text-right">{ultra.selection.tubeSize}</div>

            <div className="text-slate-600">Tubing Length</div>
            <div className="text-right font-semibold">
              {uiUnits.length === "ft"
                ? `${ultra.materials.tubing_ft} ft`
                : `${ultra.materials.tubing_m} m`}
            </div>

            <div className="text-slate-600">Loops</div>
            <div className="text-right">
              {ultra.materials.loops} (
              {uiUnits.length === "ft"
                ? `${ultra.materials.ft_per_loop} ft`
                : `${ultra.materials.m_per_loop.toFixed(1)} m`}
              /loop)
            </div>

            <div className="text-slate-600">Ultra-Fins</div>
            <div className="text-right">
              {ultra.materials.fins_pairs} pairs ({ultra.materials.fin_halves}{" "}
              halves)
            </div>

            {ultra.materials.hanging_supports != null && (
              <>
                <div className="text-slate-600">Hanging Supports</div>
                <div className="text-right">
                  {ultra.materials.hanging_supports}
                </div>
              </>
            )}

            {ultra.materials.open_web_ultra_clips != null && (
              <>
                <div className="text-slate-600">Open-Web Ultra-Clips</div>
                <div className="text-right">
                  {ultra.materials.open_web_ultra_clips}
                </div>
              </>
            )}

            {ultra.materials.topdown_ultra_clips != null && (
              <>
                <div className="text-slate-600">Top-Down Ultra-Clips</div>
                <div className="text-right">
                  {ultra.materials.topdown_ultra_clips}
                </div>
              </>
            )}

            {ultra.materials.topdown_uc1212 != null && (
              <>
                <div className="text-slate-600">UC1212 Clips</div>
                <div className="text-right">
                  {ultra.materials.topdown_uc1212}
                </div>
              </>
            )}
            {ultra.materials.topdown_uc1234 != null && (
              <>
                <div className="text-slate-600">UC1234 Clips</div>
                <div className="text-right">
                  {ultra.materials.topdown_uc1234}
                </div>
              </>
            )}

            {ultra.selection.ultraFinSpacing_mm && (
              <>
                <div className="text-slate-600">Ultra-Fin Spacing (C-C)</div>
                <div className="text-right font-semibold">
                  {ultra.selection.ultraFinSpacing_mm} mm
                </div>
              </>
            )}

            {ultra.selection.tubingSpacing_mm && (
              <>
                <div className="text-slate-600">Tubing Spacing (C-C)</div>
                <div className="text-right font-semibold">
                  {ultra.selection.tubingSpacing_mm} mm
                </div>
              </>
            )}
          </div>

          {ultra.selection.supplementalWarning && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
              🔥 Add Supplemental Heat Recommended
            </div>
          )}
        </div>
      </SectionCard>
      {/* -------- Layout Visualization -------- */}
      <SectionCard title="Layout Visualization">
        <div className="w-full h-96 border border-slate-300 rounded-md overflow-auto">
          <FloorLayoutSvg layout={layout} />
        </div>
      </SectionCard>
    </div>
  );
};
