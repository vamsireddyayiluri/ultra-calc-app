// src/components/forms/ProjectForm.tsx
import React, { useMemo, useState } from "react";
import { SectionCard } from "../layout/SectionCard";
import { Field } from "./Field";
import type {
  ProjectSettings,
  Region,
  StandardsMode,
  InsulationPeriodKey,
  GlazingType,
  MaterialUValues,
  HeatingSystem,
} from "../../models/projectTypes";
import { REGION_DEFAULTS } from "../../data/regionDefaults";
import { getDefaultUValues } from "../../utils/uDefaults";
import { getUIUnits } from "../../helpers/updateUiLabels";
import {
  fromDisplayPsiAllowance,
  fromDisplayTemperature,
  fromDisplayUValue,
  fromDisplayVentilation,
  toDisplayPsiAllowance,
  toDisplayTemperature,
  toDisplayUValue,
  toDisplayVentilation,
} from "../../utils/display";
import { ProjectValidationResult } from "../../validations.ts/projectValidator";
import { FieldValidationMessage } from "../validation/FieldValidationMessage";
import { REGION_OPTIONS } from "../../models/presets";
import {
  getHeatingSystem,
  getHeatingSystemLabel,
  HEATING_SYSTEM_LABELS,
} from "../../utils/heatingSystem";

interface ProjectFormProps {
  project: ProjectSettings;
  onUpdate: (patch: Partial<ProjectSettings>) => void;
  appliedDefaults?: Partial<Record<string, any>>;
  exportMode?: boolean;
  /** Optional — omitted in export/PDF rendering, where inline validation UI never appears. */
  validation?: ProjectValidationResult;
  /** External "jump to this field" request — e.g. from ValidationSummary via ProjectEditor. The nonce guarantees the effect re-fires even if the same field is requested twice in a row. */
  focusFieldRequest?: { field: string; nonce: number } | null;
}

// Fields that only render once "Advanced Defaults" is expanded — navigating
// to one of these has to open that section first, same idea as RoomCard
// having to expand a collapsed room before it can scroll to a field in it.
const ADVANCED_FIELDS = new Set([
  "standardsMode",
  "safetyFactorPct",
  "heatUpFactorPct",
  "psiAllowance_W_per_K",
  "mechVent_m3_per_h",
  "infiltrationACH",
]);

const HEATING_SYSTEM_OPTIONS: {
  key: HeatingSystem;
  title: string;
  image: string;
}[] = [
  {
    key: "STANDARD",
    title: HEATING_SYSTEM_LABELS.STANDARD,
    image: "/assets/diagrams/boiler.PNG",
  },
  {
    key: "HEAT_PUMP",
    title: HEATING_SYSTEM_LABELS.HEAT_PUMP,
    image: "/assets/diagrams/heat_pump.PNG",
  },
];

export const STANDARDS_OPTIONS: { key: StandardsMode; label: string }[] = [
  { key: "BS_EN_12831", label: "BS EN 12831" },
  { key: "ASHRAE", label: "ASHRAE" },
  { key: "EN_ISO_13790", label: "EN / ISO 13790" },
  { key: "CSA_F280", label: "CSA F280" },
];

export const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onUpdate,
  appliedDefaults,
  exportMode = false,
  validation,
  focusFieldRequest,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which fields the user has left (blurred) at least once — inline
  // validation messages only ever appear for touched fields, never while
  // the user is still typing. `validation` itself is always freshly
  // computed by the caller (ProjectEditor); this state only controls
  // *display* timing, not the underlying validation result.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  const fieldId = (field: string) => `project-${field}`;

  const fieldState = (
    field: string,
  ): { status: "invalid" | "incomplete" | "warning"; message: string } | undefined => {
    if (!touched[field] || !validation) return undefined;
    const fv = validation.projectFields[field];
    if (fv && fv.status !== "valid") {
      return { status: fv.status, message: fv.message ?? "This field needs attention." };
    }
    const warning = validation.projectWarnings[field];
    if (warning) return { status: "warning", message: warning };
    return undefined;
  };

  const inputClass = (field: string) => {
    const base = "w-full border rounded-md px-3 py-2";
    const fs = fieldState(field);
    if (!fs) return `${base} border-slate-300`;
    if (fs.status === "invalid") return `${base} border-red-400 bg-red-50`;
    if (fs.status === "incomplete") return `${base} border-amber-400 bg-amber-50`;
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

  const focusField = React.useCallback((field: string) => {
    const el = document.getElementById(fieldId(field));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLElement).focus({ preventScroll: true });
  }, []);

  // Waiting for "Advanced Defaults" to open before we can scroll to a
  // field that only renders once that section is expanded.
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(
    null,
  );

  const goToField = React.useCallback(
    (field: string) => {
      markTouched(field);
      if (ADVANCED_FIELDS.has(field) && !advancedOpen) {
        setPendingFocusField(field);
        setAdvancedOpen(true);
      } else {
        focusField(field);
      }
    },
    [advancedOpen, focusField],
  );

  React.useEffect(() => {
    if (advancedOpen && pendingFocusField) {
      focusField(pendingFocusField);
      setPendingFocusField(null);
    }
  }, [advancedOpen, pendingFocusField, focusField]);

  // External "jump to this field" request, e.g. from ValidationSummary.
  React.useEffect(() => {
    if (focusFieldRequest) {
      goToField(focusFieldRequest.field);
    }
    // Only re-run when a *new* request comes in (nonce changes) — not on
    // every re-render of goToField, which changes identity with advancedOpen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFieldRequest?.field, focusFieldRequest?.nonce]);

  const regionLabel = project.region ? project.region : "Canada";
  const standardsLabel = project.standardsMode ?? "BS EN 12831";
  const heatingSystem = getHeatingSystem(project);

  const uiUnits = getUIUnits(project.region);

  const standardsForRegion = useMemo(() => {
    return STANDARDS_OPTIONS;
  }, [project.region]);

  const isCustom = (k: string) => {
    if (!appliedDefaults) return false;
    return (
      typeof appliedDefaults[k] !== "undefined" &&
      project[k as keyof ProjectSettings] !== appliedDefaults[k]
    );
  };
  const DisplayValue: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => (
    <div className="w-full px-3 py-0 text-sm text-slate-800">
      {children ?? "—"}
    </div>
  );

  const numericField = (
    label: string,
    fieldKey: keyof ProjectSettings,
    value: number | undefined,
    opts?: {
      min?: number;
      max?: number;
      step?: number;
      hint?: string;
      toDisplay?: (v?: number) => number | undefined;
      fromDisplay?: (v?: number) => number | undefined;
    },
  ) => (
    <Field
      required
      label={`${label}${isCustom(fieldKey as string) ? " (custom)" : ""}`}
    >
      <input
        type="number"
        className="w-full border border-slate-300 rounded-md px-3 py-2"
        value={(opts?.toDisplay ? opts.toDisplay(value) : value) ?? ""}
        min={opts?.min}
        max={opts?.max}
        step={opts?.step ?? 0.1}
        onChange={(e) => {
          const raw =
            e.target.value === "" ? undefined : Number(e.target.value);
          const normalized = opts?.fromDisplay ? opts.fromDisplay(raw) : raw;
          onUpdate({ [fieldKey]: normalized } as Partial<ProjectSettings>);
        }}
      />
      {opts?.hint && (
        <div className="text-xs text-slate-500 mt-1">{opts.hint}</div>
      )}
    </Field>
  );

  return (
    <SectionCard title="Project">
      {/* Grouped into "what/where this project is" vs "what the
          calculation is based on" — previously all 8 fields sat in one
          undifferentiated grid with no distinction between identity
          fields and calculation inputs. */}
      {!exportMode && (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Project Info
        </h3>
      )}
      <Field label="Heating System" required>
        {exportMode ? (
          <DisplayValue>{getHeatingSystemLabel(project.heatingSystem)}</DisplayValue>
        ) : (
          <>
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Heating system"
            >
              {HEATING_SYSTEM_OPTIONS.map((option) => {
                const selected = heatingSystem === option.key;
                return (
                  <button
                    key={option.key}
                    id={fieldId(`heatingSystem-${option.key}`)}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onUpdate({ heatingSystem: option.key })}
                    className={`flex min-h-[132px] items-center gap-4 rounded-lg border p-4 text-left transition ${
                      selected
                        ? "border-blue-700 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <img
                      src={option.image}
                      alt=""
                      aria-hidden="true"
                      className="h-20 w-24 shrink-0 rounded-md object-contain"
                    />
                    <span
                      className={`text-sm font-semibold ${
                        selected ? "text-blue-900" : "text-slate-700"
                      }`}
                    >
                      {option.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Heat Pump spacing optimisation will be implemented later after
              business confirmation. Current spacing and material calculations
              are unchanged.
            </div>
          </>
        )}
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project Name" required>
          {exportMode ? (
            <DisplayValue>{project.name}</DisplayValue>
          ) : (
            <>
              <input
                id={fieldId("name")}
                className={inputClass("name")}
                value={project.name ?? ""}
                onChange={(e) => onUpdate({ name: e.target.value })}
                onBlur={() => markTouched("name")}
                {...fieldA11yProps("name")}
              />
              {renderFieldMessage("name")}
            </>
          )}
        </Field>

        <Field label="Contractor">
          {exportMode ? (
            <DisplayValue>{project.contractor || "—"}</DisplayValue>
          ) : (
            <input
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={project.contractor ?? ""}
              onChange={(e) => onUpdate({ contractor: e.target.value })}
            />
          )}
        </Field>

        <Field label="Address" required>
          {exportMode ? (
            <DisplayValue>{project.address}</DisplayValue>
          ) : (
            <>
              <input
                id={fieldId("address")}
                className={inputClass("address")}
                value={project.address ?? ""}
                onChange={(e) => onUpdate({ address: e.target.value })}
                onBlur={() => markTouched("address")}
                {...fieldA11yProps("address")}
              />
              {renderFieldMessage("address")}
            </>
          )}
        </Field>
      </div>

      {!exportMode && (
        <h3 className="mb-2 mt-6 border-t border-slate-100 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Design Conditions
        </h3>
      )}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${exportMode ? "mt-4" : ""}`}>
        {/* Region */}
        <Field label="Region" required>
          {exportMode ? (
            <DisplayValue>{regionLabel}</DisplayValue>
          ) : (
            <>
              <select
                id={fieldId("region")}
                value={project.region ?? ""}
                onChange={(e) => {
                  const region = e.target.value as Region;
                  const updatedDefaults = getDefaultUValues({
                    ...project,
                    region,
                  });
                  const defaults = REGION_DEFAULTS[region] ?? {};
                  onUpdate({
                    region,
                    ...defaults,
                    customUOverrides: updatedDefaults,
                  });
                }}
                onBlur={() => markTouched("region")}
                className={inputClass("region")}
                {...fieldA11yProps("region")}
              >
                {REGION_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {renderFieldMessage("region")}
            </>
          )}

          <div className="text-xs text-slate-500 mt-1">
            Using: <span className="font-semibold">{regionLabel}</span> —{" "}
            <span className="font-medium">{standardsLabel}</span>
          </div>
        </Field>

        {/* Design Temperatures */}
        <Field
          required
          label={`Indoor Design Temperature (${uiUnits.temperature})`}
        >
          {exportMode ? (
            <DisplayValue>
              {toDisplayTemperature(project.region, project.indoorTempC)}{" "}
              {uiUnits.temperature}
            </DisplayValue>
          ) : (
            <>
              <input
                id={fieldId("indoorTempC")}
                type="number"
                step="0.5"
                className={inputClass("indoorTempC")}
                value={
                  toDisplayTemperature(project.region, project.indoorTempC) ?? ""
                }
                onChange={(e) => {
                  const raw =
                    e.target.value === "" ? undefined : Number(e.target.value);

                  onUpdate({
                    indoorTempC: fromDisplayTemperature(project.region, raw),
                  });
                }}
                onBlur={() => markTouched("indoorTempC")}
                {...fieldA11yProps("indoorTempC")}
              />
              {renderFieldMessage("indoorTempC")}
            </>
          )}
        </Field>

        <Field
          required
          label={`Outdoor Design Temperature (${uiUnits.temperature})`}
        >
          {exportMode ? (
            <DisplayValue>
              {toDisplayTemperature(project.region, project.outdoorTempC)}{" "}
              {uiUnits.temperature}
            </DisplayValue>
          ) : (
            <>
              <input
                id={fieldId("outdoorTempC")}
                type="number"
                step="0.5"
                required
                aria-required="true"
                placeholder="Coldest Design Day (Required)"
                className={`${inputClass("outdoorTempC")} placeholder-red-300`}
                value={
                  toDisplayTemperature(project.region, project.outdoorTempC) ?? ""
                }
                onChange={(e) => {
                  const raw =
                    e.target.value === "" ? undefined : Number(e.target.value);

                  onUpdate({
                    outdoorTempC: fromDisplayTemperature(project.region, raw),
                  });
                }}
                onBlur={() => markTouched("outdoorTempC")}
                {...fieldA11yProps("outdoorTempC")}
              />
              {renderFieldMessage("outdoorTempC")}
            </>
          )}
        </Field>

        {/* Insulation Period */}
        <Field required label="Insulation Period">
          {exportMode ? (
            <DisplayValue>
              {{
                pre1980: "Pre-1980 (Poor)",
                y1980_2000: "1980–2000 (Average)",
                y2001_2015: "2001–2015 (Good)",
                y2016p: "2016+ (Efficient)",
              }[project.insulationPeriod ?? ""] ?? "—"}
            </DisplayValue>
          ) : (
            <>
              <select
                id={fieldId("insulationPeriod")}
                className={inputClass("insulationPeriod")}
                value={project.insulationPeriod ?? ""}
                onChange={(e) => {
                  const insulationPeriod = e.target.value as InsulationPeriodKey;

                  const updatedDefaults = getDefaultUValues({
                    ...project,
                    insulationPeriod,
                  });

                  onUpdate({
                    insulationPeriod,
                    customUOverrides: updatedDefaults,
                  });
                }}
                onBlur={() => markTouched("insulationPeriod")}
                {...fieldA11yProps("insulationPeriod")}
              >
                <option value="pre1980">Pre-1980 (Poor)</option>
                <option value="y1980_2000">1980–2000 (Average)</option>
                <option value="y2001_2015">2001–2015 (Good)</option>
                <option value="y2016p">2016+ (Efficient)</option>
              </select>
              {renderFieldMessage("insulationPeriod")}
            </>
          )}
        </Field>

        <Field required label="Glazing Type">
          {exportMode ? (
            <DisplayValue>
              {{
                single: "Single",
                double: "Double",
                triple: "Triple",
              }[project.glazing ?? ""] ?? "—"}
            </DisplayValue>
          ) : (
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={project.glazing ?? ""}
              onChange={(e) =>
                onUpdate({ glazing: e.target.value as GlazingType })
              }
            >
              <option value="single">Single</option>
              <option value="double">Double</option>
              <option value="triple">Triple</option>
            </select>
          )}
        </Field>
      </div>

      {/* Advanced Section */}
      {/* Advanced Section */}
      {!exportMode && (
        <div className="mt-6">
          <div className="mt-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-medium text-slate-700">
                Advanced Defaults
              </h3>
              <button
                type="button"
                className=" font-medium text-teal-600 hover:text-teal-700 transition-colors"
                onClick={() => setAdvancedOpen((s) => !s)}
              >
                {advancedOpen ? "Hide" : "Show"}
              </button>
            </div>

            {advancedOpen && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Standards Mode" required>
                  <select
                    id={fieldId("standardsMode")}
                    className={inputClass("standardsMode")}
                    value={project.standardsMode ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        standardsMode: e.target.value as StandardsMode,
                      })
                    }
                    onBlur={() => markTouched("standardsMode")}
                    {...fieldA11yProps("standardsMode")}
                  >
                    {standardsForRegion.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {renderFieldMessage("standardsMode")}
                </Field>
                {numericField(
                  "Safety Factor (%)",
                  "safetyFactorPct",
                  project.safetyFactorPct,
                  {
                    min: 0,
                    max: 100,
                    step: 0.1,
                    hint: "Typical 10–15%",
                  },
                )}
                {numericField(
                  "Heat-up Factor (%)",
                  "heatUpFactorPct",
                  project.heatUpFactorPct,
                  {
                    min: 0,
                    max: 200,
                    step: 0.1,
                    hint: "Warm-up multiplier (typical 20–30%)",
                  },
                )}
                {numericField(
                  `Psi allowance (${uiUnits.psi})`,
                  "psiAllowance_W_per_K",
                  project.psiAllowance_W_per_K,
                  {
                    min: 0,
                    max:
                      project.region === "US" ||
                      project.region === "CA_IMPERIAL"
                        ? 2
                        : 1,
                    step:
                      project.region === "US" ||
                      project.region === "CA_IMPERIAL"
                        ? 0.01
                        : 0.005,
                    hint: "Thermal bridging allowance",
                    toDisplay: (v) => toDisplayPsiAllowance(project.region, v),
                    fromDisplay: (v) =>
                      fromDisplayPsiAllowance(project.region, v),
                  },
                )}

                {numericField(
                  `Mechanical Vent. (${uiUnits.ventilation})`,
                  "mechVent_m3_per_h",
                  project.mechVent_m3_per_h,
                  {
                    min: 0,
                    max: 500, // realistic range for CFM
                    step: 1,
                    hint: `Ventilation rate (${uiUnits.ventilation})`,

                    // 🔽 DISPLAY ADAPTERS
                    toDisplay: (v) => toDisplayVentilation(project.region, v),
                    fromDisplay: (v) =>
                      fromDisplayVentilation(project.region, v),
                  },
                )}
                {numericField(
                  "Infiltration (ACH)",
                  "infiltrationACH",
                  project.infiltrationACH,
                  {
                    min: 0,
                    max: 5,
                    step: 0.01,
                    hint: "Typical 0.2–0.5",
                  },
                )}

                {/* Custom U-values */}
                <div className="md:col-span-3 border-t border-slate-200 pt-3 mt-2">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">
                    Custom U-Values
                  </h4>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {(
                      Object.keys({
                        wall: 0,
                        window: 0,
                        door: 0,
                        roof: 0,
                        floor: 0,
                      }) as (keyof MaterialUValues)[]
                    ).map((key) => (
                      <Field
                        key={key}
                        label={`${key[0].toUpperCase() + key.slice(1)} U (${
                          uiUnits.uValue
                        })`}
                        required
                      >
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full border border-slate-300 rounded-md px-3 py-2"
                          value={
                            toDisplayUValue(
                              project.region,
                              project.customUOverrides?.[key],
                            ) ?? ""
                          }
                          onChange={(e) => {
                            const raw =
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value);

                            onUpdate({
                              customUOverrides: {
                                ...project.customUOverrides,
                                [key]: fromDisplayUValue(project.region, raw),
                              },
                            });
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
};
