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
import { RightSidebar } from "../../layout/RightSidebar";
import { formatSpacing } from "../../utils/formatResults";
import {
  inlineNestedSvgImages,
  loadImageAsBase64,
  svgBase64ToPng,
} from "../../utils/pdfExport";
import { resolveSidebarAssets } from "../../layout/sidebarResolver";

interface RoomCardProps {
  room: RoomInput;
  project: ProjectSettings;
  exportMode?: boolean;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;
  onRemoveRoom: (id: string) => void;
  calculateRoom: (room: RoomInput, project: ProjectSettings) => RoomResults;
}
interface SidebarImages {
  profiles: string[];
  supportIcon: string | null;
  joistLabel: string;
  label: string;
  isOpenWeb: boolean;
  installMethod?: InstallMethod;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  project,
  exportMode = false,
  onUpdateRoom,
  onRemoveRoom,
  calculateRoom,
}) => {
  console.log("RoomCard render", room, project);
  const normalizedProject = React.useMemo(
    () => normalizeProjectSettings(project),
    [project]
  );

  const res = React.useMemo(
    () => calculateRoom(room, normalizedProject),
    [room, normalizedProject]
  );

  const ultra = React.useMemo(
    () => runUltraCalc(room, res, project),
    [room, res, project]
  );
  const [sidebarImages, setSidebarImages] =
    React.useState<SidebarImages | null>(null);

  const [layout, setLayout] = React.useState<ReturnType<
    typeof buildLayout
  > | null>(null);

  // 🔹 Build layout + load images asynchronously
  React.useEffect(() => {
    let cancelled = false;

    const build = async () => {
      if (!room.length_m || !room.width_m || !room.joistSpacing) return;

      const newLayout = buildLayout({
        roomLength_m: room.length_m,
        roomWidth_m: room.width_m,
        joist: room.joistSpacing,
        load: ultra.selection.mode === "LL" ? "LL" : "HL",
        method: ultra.selection.method,
      });
      if (exportMode) {
        for (const tile of newLayout.tiles) {
          if (!tile.asset) continue;
          tile.assetBase64 = await inlineNestedSvgImages(tile.asset);
        }
      }

      if (!cancelled) {
        setLayout(newLayout);
      }
    };

    build();

    return () => {
      cancelled = true;
    };
  }, [
    room.length_m,
    room.width_m,
    room.joistSpacing,
    ultra.selection.mode,
    ultra.selection.method,
  ]);
  React.useEffect(() => {
    let cancelled = false;

    const buildSidebar = async () => {
      const sidebar = resolveSidebarAssets(
        room.installMethod,
        room.joistSpacing
      );

      const isSvg = (s: string) => s.endsWith(".svg");

      const profiles = await Promise.all(
        sidebar?.profiles.map(async (src) => {
          if (!src) return "";
          const svg = isSvg(src)
            ? await inlineNestedSvgImages(src)
            : await loadImageAsBase64(src);

          return exportMode ? await svgBase64ToPng(svg, 104, 64) : svg;
        })
      );

      const supportIcon = sidebar.supportIcon
        ? exportMode
          ? await svgBase64ToPng(
              await inlineNestedSvgImages(sidebar.supportIcon),
              48,
              48
            )
          : await inlineNestedSvgImages(sidebar.supportIcon)
        : null;

      if (!cancelled) {
        setSidebarImages({
          profiles:profiles || [],
          supportIcon,
          joistLabel:
            room.installMethod === "INSLAB"
              ? ultra.selection.spacingDisplayText
              : sidebar.joistLabel,
          label: sidebar.label,
          isOpenWeb: sidebar?.profiles?.length === 2,
          installMethod: room.installMethod,
        });
      }
    };

    buildSidebar();
    return () => {
      cancelled = true;
    };
  }, [room.installMethod, room.joistSpacing, exportMode]);

  const uiUnits = getUIUnits(project.region);
  const lenLabel = uiUnits.length;
  const areaLabel = uiUnits.area;
  const display = formatRoomResults(project.region, res);

  const DisplayValue: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <div className="w-full px-3 py-2 text-sm text-slate-800">
      {children ?? "—"}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white">
      <SectionCard title={room.name}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Room Name */}
          <Field label="Room Name">
            {exportMode ? (
              <DisplayValue>{room.name}</DisplayValue>
            ) : (
              <input
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={room.name}
                onChange={(e) =>
                  onUpdateRoom(room.name, { name: e.target.value })
                }
              />
            )}
          </Field>

          {/* Setpoint */}
          <Field label={`Setpoint Temp (${uiUnits.temperature})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayTemperature(project.region, room.setpointC)}
              </DisplayValue>
            ) : (
              <input
                type="number"
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={
                  toDisplayTemperature(project.region, room.setpointC) ?? ""
                }
                onChange={(e) => {
                  const raw =
                    e.target.value === "" ? undefined : Number(e.target.value);
                  onUpdateRoom(room.name, {
                    setpointC: fromDisplayTemperature(project.region, raw),
                  });
                }}
              />
            )}
          </Field>

          {/* Length */}
          <Field label={`Length (${lenLabel})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayLength(project.region, room.length_m)}
              </DisplayValue>
            ) : (
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
            )}
          </Field>

          {/* Width */}
          <Field label={`Width (${lenLabel})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayLength(project.region, room.width_m)}
              </DisplayValue>
            ) : (
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
            )}
          </Field>

          {/* Height */}
          <Field label={`Height (${lenLabel})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayLength(project.region, room.height_m)}
              </DisplayValue>
            ) : (
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
            )}
          </Field>

          {/* Exterior Wall */}
          <Field label={`Exterior Wall (${lenLabel})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayLength(project.region, room.exteriorLen_m)}
              </DisplayValue>
            ) : (
              <input
                type="number"
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={
                  toDisplayLength(project.region, room.exteriorLen_m) ?? ""
                }
                onChange={(e) => {
                  const raw =
                    e.target.value === "" ? undefined : Number(e.target.value);
                  onUpdateRoom(room.name, {
                    exteriorLen_m: fromDisplayLength(project.region, raw),
                  });
                }}
              />
            )}
          </Field>

          {/* Windows */}
          <Field label={`Windows (${areaLabel})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayArea(project.region, room.windowArea_m2)}
              </DisplayValue>
            ) : (
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
            )}
          </Field>

          {/* Doors */}
          <Field label={`Doors (${areaLabel})`}>
            {exportMode ? (
              <DisplayValue>
                {toDisplayArea(project.region, room.doorArea_m2)}
              </DisplayValue>
            ) : (
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
            )}
          </Field>

          {/* Joist Spacing */}
          <Field label="Joist Spacing">
            {exportMode ? (
              <DisplayValue>
                {room.joistSpacing}" ({Math.round(room.joistSpacing * 25.4)} mm)
              </DisplayValue>
            ) : (
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={room.joistSpacing ?? ""}
                onChange={(e) =>
                  onUpdateRoom(room.name, {
                    joistSpacing: Number(e.target.value) as JoistSpacingOption,
                  })
                }
              >
                <option value={12}>12" (300 mm)</option>
                <option value={16}>16" (400 mm)</option>
                <option value={19}>19" (488 mm)</option>
                <option value={24}>24" (600 mm)</option>
              </select>
            )}
          </Field>

          {/* Floor Cover */}
          <Field label="Floor Cover">
            {exportMode ? (
              <DisplayValue>{room.floorCover}</DisplayValue>
            ) : (
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={room.floorCover ?? ""}
                onChange={(e) =>
                  onUpdateRoom(room.name, {
                    floorCover: e.target.value as FloorCoverKey,
                  })
                }
              >
                <option value="tile_stone">Tile / Stone</option>
                <option value="vinyl_lvt">Vinyl / LVT</option>
                <option value="laminate">Laminate</option>
                <option value="engineered_wood">Engineered Wood</option>
                <option value="solid_wood">Solid Wood</option>
                <option value="carpet_low_pad">Carpet (Low Pad)</option>
                <option value="carpet_high_pad">Carpet (High Pad)</option>
              </select>
            )}
          </Field>
          {/* Install Method */}
          <Field label="Install Method">
            {exportMode ? (
              <DisplayValue>
                {INSTALL_METHOD_OPTIONS.find(
                  (opt) => opt.value === room.installMethod
                )?.label || "—"}
              </DisplayValue>
            ) : (
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={room.installMethod ?? ""}
                onChange={(e) => {
                  const value = e.target.value as InstallMethod;

                  onUpdateRoom(room.name, {
                    installMethod: value,
                    floorOnGround: value === "INSLAB",
                  });
                }}
              >
                {INSTALL_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={`Floor On Ground`}>
            {exportMode ? (
              <DisplayValue>
                {room.floorOnGround ? "Yes — floor on ground" : "No"}
              </DisplayValue>
            ) : (
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(room.floorOnGround)}
                  onChange={(e) =>
                    onUpdateRoom(room.name, {
                      floorOnGround: e.target.checked,
                    })
                  }
                  style={{ cursor: "pointer" }}
                  className="h-4 w-4 accent-teal-600"
                />
                <span className="text-sm text-slate-700 select-none">
                  Yes — floor on ground
                </span>
              </label>
            )}
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
          {!exportMode && (
            <button onClick={() => onRemoveRoom(room.name)}>Remove room</button>
          )}
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
                <div className="text-slate-600">Ultra-Clip</div>
                <div className="text-right">
                  {ultra.materials.topdown_ultra_clips}
                </div>
              </>
            )}

            {ultra.materials.topdown_uc1212 != null && (
              <>
                <div className="text-slate-600">UC1212</div>
                <div className="text-right">
                  {ultra.materials.topdown_uc1212}
                </div>
              </>
            )}

            {ultra.materials.topdown_uc1234 != null && (
              <>
                <div className="text-slate-600">UC1234</div>
                <div className="text-right">
                  {ultra.materials.topdown_uc1234}
                </div>
              </>
            )}

            {ultra.selection.ultraFinSpacing_mm && (
              <>
                <div className="text-slate-600">Ultra-Fin Spacing (C-C)</div>
                <div className="text-right font-semibold">
                  {formatSpacing(
                    project.region,
                    ultra.selection.ultraFinSpacing_mm
                  )}
                </div>
              </>
            )}

            {ultra.selection.tubingSpacing_mm && (
              <>
                <div className="text-slate-600">Tubing Spacing (C-C)</div>
                <div className="text-right font-semibold">
                  {formatSpacing(
                    project.region,
                    ultra.selection.tubingSpacing_mm
                  )}
                </div>
              </>
            )}
            {ultra.selection.spacingDisplayText && (
              <>
                <div className="text-slate-600">Tubing Spacing (C-C)</div>
                <div className="text-right font-semibold">
                  {ultra.selection.spacingDisplayText}
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
      {layout && sidebarImages?.profiles && (
        <SectionCard title="Layout Visualization">
          <div className="flex flex-row items-start gap-4">
            <div className="flex-1 min-h-[320px]">
              <FloorLayoutSvg layout={layout} />
            </div>

            <div className="flex-shrink-0">
              <RightSidebar images={sidebarImages} />
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};
