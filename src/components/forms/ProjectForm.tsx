// src/components/forms/ProjectForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "../layout/SectionCard";
import { Field } from "./Field";
import type {
  ProjectSettings,
  Region,
  StandardsMode,
  InsulationPeriodKey,
  GlazingType,
  MaterialUValues,
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

interface ProjectFormProps {
  project: ProjectSettings;
  onUpdate: (patch: Partial<ProjectSettings>) => void;
  appliedDefaults?: Partial<Record<string, any>>;
}

const REGION_OPTIONS: { key: Region; label: string }[] = [
  { key: "UK", label: "United Kingdom" },
  { key: "EU", label: "European Union" },
  { key: "US", label: "United States" },
  { key: "CA_METRIC", label: "Canada (Metric U-values)" },
  { key: "CA_IMPERIAL", label: "Canada (Imperial U-values)" },
];

declare global {
  interface Window {
    google: any;
  }
}
const STANDARDS_OPTIONS: { key: StandardsMode; label: string }[] = [
  { key: "BS_EN_12831", label: "BS EN 12831" },
  { key: "ASHRAE", label: "ASHRAE" },
  { key: "EN_ISO_13790", label: "EN / ISO 13790" },
  { key: "CSA_F280", label: "CSA F280" },
];

export const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onUpdate,
  appliedDefaults,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  const regionLabel = project.region ? project.region : "Canada";
  const standardsLabel = project.standardsMode ?? "BS EN 12831";

  const uiUnits = getUIUnits(project.region);

  // === Auto-detect location ===
  useEffect(() => {
    if (project.id) return;
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${
              import.meta.env.VITE_GOOGLE_API_KEY
            }`,
          );
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            onUpdate({ address });
            if (inputRef.current) inputRef.current.value = address;
          }
        } catch (err) {
          console.error("Reverse geocoding failed:", err);
        }
      },
      () => {
        setError(
          "Unable to fetch your location. Please allow location access.",
        );
      },
    );
  }, [project.id]);

  // === Google Places Autocomplete ===
  useEffect(() => {
    const initAutocomplete = () => {
      if (!window.google || !inputRef.current) return;

      const options = {
        fields: ["geometry", "formatted_address"],
        types: ["address"],
      };
      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current,
        options,
      );
      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current.getPlace();
        if (!place.geometry) {
          setError("No details found for this address.");
          return;
        }
        const address = place.formatted_address;
        onUpdate({ address });
        setError(null);
      });
    };

    if (window.google && window.google.maps) {
      initAutocomplete();
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.maps) {
          initAutocomplete();
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [project.id]);

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
    <Field required label={`${label}${isCustom(fieldKey as string) ? " (custom)" : ""}`}>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project Name" required>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={project.name ?? ""}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g., Smith Residence – Main Floor"
          />
        </Field>

        <Field label="Contractor">
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={project.contractor ?? ""}
            onChange={(e) => onUpdate({ contractor: e.target.value })}
            placeholder="e.g., ABC Mechanical Ltd."
          />
        </Field>

        {/* Region */}
        <Field label="Region" required>
          <select
            value={project.region ?? ""}
            onChange={(e) => {
              const region = e.target.value as Region;
              const updatedDefaults = getDefaultUValues({ ...project, region });
              const defaults = REGION_DEFAULTS[region] ?? {};
              onUpdate({
                region,
                ...defaults,
                customUOverrides: updatedDefaults,
              });
            }}
            className="w-full border border-slate-300 rounded-md px-3 py-2"
          >
            {REGION_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-500 mt-1">
            Using: <span className="font-semibold">{regionLabel}</span> —{" "}
            <span className="font-medium">{standardsLabel}</span>
          </div>
        </Field>

        <Field label="Address" required>
          <input
            ref={inputRef}
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            defaultValue={project.address ?? ""}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="Street, City, State/Province, Zip/Postal Code"
          />
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </Field>

        {/* Design Temperatures */}
        <Field required label={`Indoor Design Temperature (${uiUnits.temperature})`}>
          <input
            type="number"
            step="0.5"
            className="w-full border border-slate-300 rounded-md px-3 py-2"
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
          />
        </Field>

        <Field required label={`Outdoor Design Temperature (${uiUnits.temperature})`}>
          <input
            type="number"
            step="0.5"
            required
            aria-required="true"
            placeholder="Coldest Design Day (Required)"
            className="
      w-full border border-slate-300 rounded-md px-3 py-2 placeholder-red-300
    "
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
          />
        </Field>

        {/* Insulation Period */}
        <Field required label="Insulation Period">
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2"
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
          >
            <option value="pre1980">Pre-1980 (Poor)</option>
            <option value="y1980_2000">1980–2000 (Average)</option>
            <option value="y2001_2015">2001–2015 (Good)</option>
            <option value="y2016p">2016+ (Efficient)</option>
          </select>
        </Field>

        <Field required label="Glazing Type">
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
        </Field>
      </div>

      {/* Advanced Section */}
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
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                value={project.standardsMode ?? ""}
                onChange={(e) =>
                  onUpdate({ standardsMode: e.target.value as StandardsMode })
                }
              >
                {standardsForRegion.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
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
                  project.region === "US" || project.region === "CA_IMPERIAL"
                    ? 2
                    : 1,
                step:
                  project.region === "US" || project.region === "CA_IMPERIAL"
                    ? 0.01
                    : 0.005,
                hint: "Thermal bridging allowance",
                toDisplay: (v) => toDisplayPsiAllowance(project.region, v),
                fromDisplay: (v) => fromDisplayPsiAllowance(project.region, v),
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
                fromDisplay: (v) => fromDisplayVentilation(project.region, v),
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
    </SectionCard>
  );
};
