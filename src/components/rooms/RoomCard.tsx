// src/components/rooms/RoomCard.tsx
import React, { useEffect, useRef } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
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
import { LayoutLegend } from "../../layout/LayoutLegend";
import { formatSpacing, formatTubeSizing } from "../../utils/formatResults";
import {
  inlineNestedSvgImages,
  loadImageAsBase64,
  svgBase64ToPng,
} from "../../utils/pdfExport";
import { resolveSidebarAssets } from "../../layout/sidebarResolver";
import {
  FieldStatus,
  RoomValidationResult,
  ROOM_FIELD_LABELS,
} from "../../validations.ts/projectValidator";
import { FieldValidationMessage } from "../validation/FieldValidationMessage";

interface RoomCardProps {
  room: RoomInput;
  project: ProjectSettings;
  exportMode?: boolean;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;
  onRemoveRoom: (id: string) => void;
  calculateRoom: (room: RoomInput, project: ProjectSettings) => RoomResults;
  /** Optional — omitted in export/PDF rendering, where inline validation UI never appears. */
  roomValidation?: RoomValidationResult;
  /** Whether the room's full detail is shown. Defaults to true (always expanded) when omitted — keeps RoomDetailsExport.tsx's usage unchanged, since PDF export always needs full content regardless of the in-app collapsed/expanded state. */
  isExpanded?: boolean;
  /** Omitted in export mode — there's no toggle UI to wire up there. */
  onToggleExpand?: () => void;
  /** External "jump to a field in this room" request — e.g. from ValidationSummary via ProjectEditor. The nonce guarantees the effect re-fires even if the same field is requested twice in a row. */
  focusFieldRequest?: { field: string; nonce: number } | null;
}

const roomFieldLabel = (key: string): string =>
  ROOM_FIELD_LABELS[key as keyof typeof ROOM_FIELD_LABELS] ?? key;

const ROOM_STATUS_META: Record<
  FieldStatus,
  { icon: string; label: string; className: string }
> = {
  valid: {
    icon: "✓",
    label: "Complete",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  incomplete: {
    icon: "○",
    label: "Incomplete",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  invalid: {
    icon: "⚠",
    label: "Needs attention",
    className: "bg-red-50 text-red-700 border-red-200",
  },
};
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
  roomValidation,
  isExpanded,
  onToggleExpand,
  focusFieldRequest,
}) => {
  const expanded = exportMode ? true : (isExpanded ?? true);
  // Export mode never shows the compact header (see below), so the
  // section still needs the room name as its own title there. In the
  // normal in-app view the compact header already shows the name, so
  // repeating it as the section title too would just be the same text
  // twice in a row.
  const roomDetailsTitle = exportMode ? room.name : "Room Details";
  const normalizedProject = React.useMemo(
    () => normalizeProjectSettings(project),
    [project],
  );
  const layoutRef = useRef<HTMLDivElement>(null);
  const [labelFontSize, setLabelFontSize] = React.useState(16);
  const uiUnits = getUIUnits(project.region);

  const lengthLabel = `← Length (${uiUnits.length}) →`;
  const widthLabel = `← Width (${uiUnits.length}) →`;

  useEffect(() => {
    if (!layoutRef.current) return;

    const updateFontSize = () => {
      const width = layoutRef.current!.clientWidth;

      // Longest label determines the font size
      const longestLabel = Math.max(lengthLabel.length, widthLabel.length);

      const size = Math.min(28, Math.max(12, width / (longestLabel * 0.65)));

      setLabelFontSize(size);
    };

    updateFontSize();

    const observer = new ResizeObserver(updateFontSize);
    observer.observe(layoutRef.current);

    return () => observer.disconnect();
  }, [lengthLabel, widthLabel]);

  const res = React.useMemo(
    () => calculateRoom(room, normalizedProject),
    [room, normalizedProject],
  );

  const ultra = React.useMemo(
    () => runUltraCalc(room, res, project),
    [room, res, project],
  );
  const [sidebarImages, setSidebarImages] =
    React.useState<SidebarImages | null>(null);

  const [layout, setLayout] = React.useState<ReturnType<
    typeof buildLayout
  > | null>(null);
  const [windowInput, setWindowInput] = React.useState<string>("");
  const [doorInput, setDoorInput] = React.useState<string>("");

  // Which fields the user has blurred at least once — inline validation
  // messages only ever appear for touched fields, never while typing.
  // roomValidation itself is always freshly computed by the caller
  // (ProjectEditor); this state only controls *display* timing.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  const fieldId = (field: string) => `room-${room.id}-${field}`;

  const fieldState = (
    field: string,
  ):
    | { status: "invalid" | "incomplete" | "warning"; message: string }
    | undefined => {
    if (!touched[field] || !roomValidation) return undefined;
    const fv = roomValidation.fields[field];
    if (fv && fv.status !== "valid") {
      return {
        status: fv.status,
        message: fv.message ?? "This field needs attention.",
      };
    }
    const warning = roomValidation.warnings[field];
    if (warning) return { status: "warning", message: warning };
    return undefined;
  };

  const inputClass = (field: string) => {
    const base = "w-full border rounded-md px-3 py-2";
    const fs = fieldState(field);
    if (!fs) return `${base} border-slate-300`;
    if (fs.status === "invalid") return `${base} border-red-400 bg-red-50`;
    if (fs.status === "incomplete")
      return `${base} border-amber-400 bg-amber-50`;
    return `${base} border-sky-300 bg-sky-50`;
  };

  const fieldA11yProps = (field: string) => {
    const fs = fieldState(field);
    if (!fs) return {};
    return {
      "aria-invalid": fs.status === "invalid" ? true : undefined,
      "aria-describedby": `${fieldId(field)}-msg`,
    };
  };

  const renderFieldMessage = (field: string) => {
    const fs = fieldState(field);
    if (!fs) return null;
    return (
      <FieldValidationMessage
        id={`${fieldId(field)}-msg`}
        status={fs.status}
        message={fs.message}
      />
    );
  };

  // Which fields are currently invalid/incomplete for this room — reuses
  // roomValidation directly (no duplicate validation logic), just reads
  // the same error/incomplete maps the badges already summarize as counts.
  const badFields = React.useMemo(() => {
    if (!roomValidation) return [];
    return [
      ...Object.keys(roomValidation.errors),
      ...Object.keys(roomValidation.incomplete),
    ];
  }, [roomValidation]);

  // Waiting for a field to become expanded before we can scroll to it —
  // set when the room was collapsed at the time navigation was requested.
  const [pendingFocusField, setPendingFocusField] = React.useState<
    string | null
  >(null);

  const focusField = React.useCallback(
    (field: string) => {
      const el = document.getElementById(fieldId(field));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).focus({ preventScroll: true });
    },
    [room.id],
  );

  const goToField = React.useCallback(
    (field: string) => {
      markTouched(field);
      if (expanded) {
        focusField(field);
      } else {
        // Not expanded yet — expand first, then the effect below fires
        // once `expanded` actually becomes true and the input exists.
        setPendingFocusField(field);
        onToggleExpand?.();
      }
    },
    [expanded, focusField, onToggleExpand],
  );

  React.useEffect(() => {
    if (expanded && pendingFocusField) {
      focusField(pendingFocusField);
      setPendingFocusField(null);
    }
  }, [expanded, pendingFocusField, focusField]);

  // External "jump to this field" request, e.g. from ValidationSummary.
  React.useEffect(() => {
    if (focusFieldRequest) {
      goToField(focusFieldRequest.field);
    }
    // Only re-run when a *new* request comes in (nonce changes) — not on
    // every re-render of goToField, which changes identity with `expanded`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFieldRequest?.field, focusFieldRequest?.nonce]);

  const handleBadgeClick = () => {
    if (badFields.length === 0) return;
    badFields.forEach(markTouched);
    goToField(badFields[0]);
  };

  React.useEffect(() => {
    if (room.windowArea_m2 != null) {
      const val = toDisplayArea(project.region, room.windowArea_m2);
      setWindowInput(val != null ? val.toFixed(2) : "");
    } else {
      setWindowInput("");
    }
  }, [room.windowArea_m2, project.region]);

  React.useEffect(() => {
    if (room.doorArea_m2 != null) {
      const val = toDisplayArea(project.region, room.doorArea_m2);
      setDoorInput(val != null ? val.toFixed(2) : "");
    } else {
      setDoorInput("");
    }
  }, [room.doorArea_m2, project.region]);

  // 🔹 Build layout + load images asynchronously
  React.useEffect(() => {
    let cancelled = false;
    console.log("Building layout for room:", room.name);

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
        room.joistSpacing,
      );

      const isSvg = (s: string) => s.endsWith(".svg");

      const profiles = await Promise.all(
        sidebar?.profiles.map(async (src) => {
          if (!src) return "";
          const svg = isSvg(src)
            ? await inlineNestedSvgImages(src)
            : await loadImageAsBase64(src);

          return exportMode ? await svgBase64ToPng(svg, 104, 64) : svg;
        }),
      );

      const supportIcon = sidebar.supportIcon
        ? exportMode
          ? await svgBase64ToPng(
              await inlineNestedSvgImages(sidebar.supportIcon),
              48,
              48,
            )
          : await inlineNestedSvgImages(sidebar.supportIcon)
        : null;

      if (!cancelled) {
        setSidebarImages({
          profiles: profiles || [],
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

  const lenLabel = uiUnits.length;
  const areaLabel = uiUnits.area;
  const display = formatRoomResults(project.region, res);

  const DisplayValue: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <div className="w-full px-3 py-0 text-sm text-slate-800">
      {children ?? "—"}
    </div>
  );

  // One combined-spacing figure for the metadata header — same three
  // optional fields already shown individually in the Results & Materials
  // card below (ultraFinSpacing_mm / tubingSpacing_mm / spacingDisplayText
  // from ultra.selection), just picking whichever one this install method
  // actually populates. No new calculation, purely a display choice.
  const tubeSpacingDisplay = ultra.selection.spacingDisplayText
    ? ultra.selection.spacingDisplayText
    : ultra.selection.ultraFinSpacing_mm
      ? formatSpacing(project.region, ultra.selection.ultraFinSpacing_mm)
      : ultra.selection.tubingSpacing_mm
        ? formatSpacing(project.region, ultra.selection.tubingSpacing_mm)
        : "—";

  const MetaItem: React.FC<{ label: string; value: React.ReactNode }> = ({
    label,
    value,
  }) => (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="truncate font-semibold text-slate-800">
        {value ?? "—"}
      </div>
    </div>
  );

  return (
    <div className="bg-white">
      {/* Compact header — always visible, independent of expanded state.
          Reducing a many-room project to one line per room (name, status,
          headline heat figure, remove) is what actually solves the "10
          rooms = enormous scroll" problem; the full input/results/layout
          grid below only mounts when expanded. */}
      {!exportMode && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <ChevronRight
              size={18}
              aria-hidden="true"
              className={`shrink-0 text-slate-400 transition-transform duration-150 ${
                expanded ? "rotate-90" : ""
              }`}
            />
            <span className="truncate font-semibold text-slate-800">
              {room.name || "Unnamed room"}
            </span>
          </button>
          {roomValidation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBadgeClick();
              }}
              disabled={badFields.length === 0}
              title={
                badFields.length > 0
                  ? `Needs attention: ${badFields.map(roomFieldLabel).join(", ")}`
                  : undefined
              }
              className={`hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${ROOM_STATUS_META[roomValidation.status].className} ${badFields.length > 0 ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
            >
              <span aria-hidden="true">
                {ROOM_STATUS_META[roomValidation.status].icon}
              </span>
              {ROOM_STATUS_META[roomValidation.status].label}
            </button>
          )}
          <span className="shrink-0 text-sm font-medium text-slate-500">
            {display.totalHeat}
          </span>
          <button
            type="button"
            onClick={() => onRemoveRoom(room.name)}
            aria-label={`Remove ${room.name || "room"}`}
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {expanded && (
        <div
          className={`grid gap-4 bg-white ${
            exportMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2 mt-3"
          }`}
        >
          <SectionCard title={roomDetailsTitle} exportMode={exportMode}>
            {!exportMode && roomValidation && (
              <button
                type="button"
                onClick={handleBadgeClick}
                disabled={badFields.length === 0}
                className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${ROOM_STATUS_META[roomValidation.status].className} ${badFields.length > 0 ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
              >
                <span aria-hidden="true">
                  {ROOM_STATUS_META[roomValidation.status].icon}
                </span>
                <span>{ROOM_STATUS_META[roomValidation.status].label}</span>
                {roomValidation.status !== "valid" && (
                  <span className="opacity-75">
                    {badFields.length <= 3
                      ? `(${badFields.map(roomFieldLabel).join(", ")})`
                      : `(${badFields.length} fields)`}
                  </span>
                )}
              </button>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Room Name */}
              <Field label="Room Name" exportMode={exportMode} required>
                {exportMode ? (
                  <DisplayValue>{room.name}</DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("name")}
                      className={inputClass("name")}
                      value={room.name}
                      onChange={(e) =>
                        onUpdateRoom(room.name, { name: e.target.value })
                      }
                      onBlur={() => markTouched("name")}
                      {...fieldA11yProps("name")}
                    />
                    {renderFieldMessage("name")}
                  </>
                )}
              </Field>

              {/* Setpoint */}
              <Field
                label={`Setpoint Temp (${uiUnits.temperature})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayTemperature(project.region, room.setpointC)}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("setpointC")}
                      type="number"
                      className={inputClass("setpointC")}
                      value={
                        toDisplayTemperature(project.region, room.setpointC) ??
                        ""
                      }
                      onChange={(e) => {
                        const raw =
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value);
                        onUpdateRoom(room.name, {
                          setpointC: fromDisplayTemperature(
                            project.region,
                            raw,
                          ),
                        });
                      }}
                      onBlur={() => markTouched("setpointC")}
                      {...fieldA11yProps("setpointC")}
                    />
                    {renderFieldMessage("setpointC")}
                  </>
                )}
              </Field>

              {/* Length */}
              <Field
                label={`Length (${lenLabel})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayLength(project.region, room.length_m)}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("length_m")}
                      type="number"
                      className={inputClass("length_m")}
                      value={
                        toDisplayLength(project.region, room.length_m) ?? ""
                      }
                      onChange={(e) => {
                        const raw =
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value);
                        onUpdateRoom(room.name, {
                          length_m: fromDisplayLength(project.region, raw),
                        });
                      }}
                      onBlur={() => markTouched("length_m")}
                      {...fieldA11yProps("length_m")}
                    />
                    {renderFieldMessage("length_m")}
                  </>
                )}
              </Field>

              {/* Width */}
              <Field
                label={`Width (${lenLabel})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayLength(project.region, room.width_m)}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("width_m")}
                      type="number"
                      className={inputClass("width_m")}
                      value={
                        toDisplayLength(project.region, room.width_m) ?? ""
                      }
                      onChange={(e) => {
                        const raw =
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value);
                        onUpdateRoom(room.name, {
                          width_m: fromDisplayLength(project.region, raw),
                        });
                      }}
                      onBlur={() => markTouched("width_m")}
                      {...fieldA11yProps("width_m")}
                    />
                    {renderFieldMessage("width_m")}
                  </>
                )}
              </Field>

              {/* Height */}
              <Field
                label={`Height (${lenLabel})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayLength(project.region, room.height_m)}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("height_m")}
                      type="number"
                      className={inputClass("height_m")}
                      value={
                        toDisplayLength(project.region, room.height_m) ?? ""
                      }
                      onChange={(e) => {
                        const raw =
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value);
                        onUpdateRoom(room.name, {
                          height_m: fromDisplayLength(project.region, raw),
                        });
                      }}
                      onBlur={() => markTouched("height_m")}
                      {...fieldA11yProps("height_m")}
                    />
                    {renderFieldMessage("height_m")}
                  </>
                )}
              </Field>

              {/* Exterior Wall */}
              <Field
                label={`Exterior Wall (${lenLabel})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayLength(project.region, room.exteriorLen_m)}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("exteriorLen_m")}
                      type="number"
                      className={inputClass("exteriorLen_m")}
                      value={
                        toDisplayLength(project.region, room.exteriorLen_m) ??
                        ""
                      }
                      onChange={(e) => {
                        const raw =
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value);
                        onUpdateRoom(room.name, {
                          exteriorLen_m: fromDisplayLength(project.region, raw),
                        });
                      }}
                      onBlur={() => markTouched("exteriorLen_m")}
                      {...fieldA11yProps("exteriorLen_m")}
                    />
                    {renderFieldMessage("exteriorLen_m")}
                  </>
                )}
              </Field>

              {/* Windows */}
              <Field
                label={`Windows (${areaLabel})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayArea(project.region, room.windowArea_m2)?.toFixed(
                      2,
                    )}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("windowArea_m2")}
                      type="number"
                      className={inputClass("windowArea_m2")}
                      value={windowInput}
                      onChange={(e) => {
                        setWindowInput(e.target.value); // ✅ free typing
                      }}
                      onBlur={() => {
                        const raw =
                          windowInput === "" ? undefined : Number(windowInput);

                        onUpdateRoom(room.name, {
                          windowArea_m2: fromDisplayArea(project.region, raw),
                        });
                        markTouched("windowArea_m2");
                      }}
                      {...fieldA11yProps("windowArea_m2")}
                    />
                    {renderFieldMessage("windowArea_m2")}
                  </>
                )}
              </Field>

              {/* Doors */}
              <Field
                label={`Doors (${areaLabel})`}
                exportMode={exportMode}
                required
              >
                {exportMode ? (
                  <DisplayValue>
                    {toDisplayArea(project.region, room.doorArea_m2)?.toFixed(
                      2,
                    )}
                  </DisplayValue>
                ) : (
                  <>
                    <input
                      id={fieldId("doorArea_m2")}
                      type="number"
                      className={inputClass("doorArea_m2")}
                      value={doorInput}
                      onChange={(e) => {
                        setDoorInput(e.target.value); // ✅ free typing
                      }}
                      onBlur={() => {
                        const raw =
                          doorInput === "" ? undefined : Number(doorInput);

                        onUpdateRoom(room.name, {
                          doorArea_m2: fromDisplayArea(project.region, raw),
                        });
                        markTouched("doorArea_m2");
                      }}
                      {...fieldA11yProps("doorArea_m2")}
                    />
                    {renderFieldMessage("doorArea_m2")}
                  </>
                )}
              </Field>

              {/* Joist Spacing */}
              <Field label="Joist Spacing" exportMode={exportMode} required>
                {exportMode ? (
                  <DisplayValue>
                    {room.joistSpacing}" ({Math.round(room.joistSpacing * 25.4)}{" "}
                    mm)
                  </DisplayValue>
                ) : (
                  <select
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                    value={room.joistSpacing ?? ""}
                    onChange={(e) =>
                      onUpdateRoom(room.name, {
                        joistSpacing: Number(
                          e.target.value,
                        ) as JoistSpacingOption,
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
              <Field label="Floor Cover" exportMode={exportMode} required>
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
              <Field label="Install Method" exportMode={exportMode} required>
                {exportMode ? (
                  <DisplayValue>
                    {INSTALL_METHOD_OPTIONS.find(
                      (opt) => opt.value === room.installMethod,
                    )?.label || "—"}
                  </DisplayValue>
                ) : (
                  <>
                    <select
                      id={fieldId("installMethod")}
                      className={inputClass("installMethod")}
                      value={room.installMethod ?? ""}
                      onChange={(e) => {
                        const value = e.target.value as InstallMethod;

                        onUpdateRoom(room.name, {
                          installMethod: value,
                          floorOnGround: value === "INSLAB",
                        });
                      }}
                      onBlur={() => markTouched("installMethod")}
                      {...fieldA11yProps("installMethod")}
                    >
                      {INSTALL_METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {renderFieldMessage("installMethod")}
                  </>
                )}
              </Field>
              <Field label={`Floor On Ground`} exportMode={exportMode} required>
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

            <div className="mt-3 mb-2 text-xs text-slate-500">
              {/* "Remove" now lives once, in the compact header above — not
              duplicated here. */}
              Area:{" "}
              {toDisplayArea(
                project.region,
                room.length_m * room.width_m,
              )?.toFixed(2)}{" "}
              {uiUnits.area}
            </div>
          </SectionCard>

          {/* -------- Physics Results -------- */}
          <SectionCard title="Results & Materials" exportMode={exportMode}>
            {/* ---------------- Heat Loss Results ---------------- */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">
                Heat Loss Results
              </h4>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Total Heat</div>
                <div className="text-right font-semibold">
                  {display.totalHeat}
                </div>

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
                <div className="text-right font-semibold">
                  {display.waterTemp}
                </div>
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
                <div className="text-right">
                  {formatTubeSizing(project.region, ultra.selection.tubeSize)}
                </div>

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
                  {ultra.materials.fins_pairs} pairs (
                  {ultra.materials.fin_halves} halves)
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
                    <div className="text-slate-600 mb-2">
                      Ultra-Fin Spacing (C-C)
                    </div>
                    <div className="text-right font-semibold">
                      {formatSpacing(
                        project.region,
                        ultra.selection.ultraFinSpacing_mm,
                      )}
                    </div>
                  </>
                )}

                {ultra.selection.tubingSpacing_mm && (
                  <>
                    <div className="text-slate-600 mb-2">
                      Tubing Spacing (C-C)
                    </div>
                    <div className="text-right font-semibold">
                      {formatSpacing(
                        project.region,
                        ultra.selection.tubingSpacing_mm,
                      )}
                    </div>
                  </>
                )}
                {ultra.selection.spacingDisplayText && (
                  <>
                    <div className="text-slate-600 mb-2">
                      Tubing Spacing (C-C)
                    </div>
                    <div className="text-right font-semibold">
                      {ultra.selection.spacingDisplayText}
                    </div>
                  </>
                )}
              </div>

              {ultra.selection.supplementalWarning && (
                <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2 mb-2">
                  🔥 Add Supplemental Heat Recommended
                </div>
              )}
            </div>
          </SectionCard>
          {/* -------- Layout Visualization -------- */}
          {/* Full-width (lg:col-span-2): this is the primary visual output of
          the room, previously squeezed into the same half-width column as
          Room Details / Results & Materials. It also has to stand on its
          own — the metadata header below repeats the room's key numbers
          (already computed above as room/res/ultra/display) so someone
          looking only at this card, without scrolling back to Room
          Details, still has full context. */}
          {!exportMode && layout && sidebarImages?.profiles && (
            <SectionCard title="Layout Visualization" className="lg:col-span-2">
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-5">
                <MetaItem label="Room" value={room.name || "Unnamed room"} />
                <MetaItem
                  label="Dimensions"
                  value={`${toDisplayLength(project.region, room.length_m)} × ${toDisplayLength(project.region, room.width_m)} ${lenLabel}`}
                />
                <MetaItem
                  label="Area"
                  value={`${toDisplayArea(project.region, room.length_m * room.width_m)?.toFixed(2)} ${areaLabel}`}
                />
                <MetaItem label="Heat Load" value={display.totalHeat} />
                <MetaItem label="Water Temp" value={display.waterTemp} />
                <MetaItem
                  label="Tube Size"
                  value={formatTubeSizing(
                    project.region,
                    ultra.selection.tubeSize,
                  )}
                />
                <MetaItem label="Tube Spacing" value={tubeSpacingDisplay} />
                <MetaItem
                  label="Install Method"
                  value={getInstallMethodLabel(room.installMethod)}
                />
                <MetaItem
                  label="Joist Spacing"
                  value={`${room.joistSpacing}" (${Math.round(room.joistSpacing * 25.4)} mm)`}
                />
              </div>

              {room.installMethod !== "INSLAB" && (
                <div className="mb-3">
                  <LayoutLegend tiles={layout.tiles} />
                </div>
              )}

              {/* flex-col on mobile: side-by-side (flex-row) squeezed the
              floor-layout SVG (min-h-320px) and the fixed-width sidebar
              into a narrow mobile viewport, making the diagram
              illegible. Stacked full-width on small screens, side by
              side from sm: up where there's room for both. */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div
                  ref={layoutRef}
                  className="relative min-h-[280px] w-full sm:flex-1"
                >
                  {" "}
                  {/* Width */}
                  <div className="absolute left-[-44px] top-1/2 -translate-y-1/2 flex items-center">
                    <div
                      className="-rotate-90 font-semibold text-slate-600 whitespace-nowrap"
                      style={{ fontSize: `${labelFontSize}px` }}
                    >
                      {lengthLabel}
                    </div>
                  </div>
                  <FloorLayoutSvg
                    layout={layout}
                    installMethod={room.installMethod}
                  />
                  {/* Length */}
                  <div
                    className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 font-semibold text-slate-600 whitespace-nowrap"
                    style={{ fontSize: `${labelFontSize}px` }}
                  >
                    <div
                      className="font-semibold text-slate-600 whitespace-nowrap"
                      style={{ fontSize: `${labelFontSize}px` }}
                    >
                      {widthLabel}
                    </div>
                  </div>
                </div>

                <div className="w-full flex-shrink-0 sm:w-auto">
                  <RightSidebar images={sidebarImages} />
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
};
