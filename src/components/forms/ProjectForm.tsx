// src/components/forms/ProjectForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "../layout/SectionCard";
import { Field } from "./Field";
import type {
  ProjectHeader,
  RegionKey,
  StandardsMode,
  PeriodKey,
} from "../../models/projectTypes";
import { REGION_DEFAULTS } from "../../data/regionDefaults";

/* Props:
   - project: full project object (may already include region/default fields)
   - onUpdate: update partial project fields
   - onApplyRegionDefaults: optional - parent can force-apply defaults when called
*/
interface ProjectFormProps {
  project: ProjectHeader & Partial<Record<string, any>>;
  onUpdate: (patch: Partial<ProjectHeader & Record<string, any>>) => void;
  onApplyRegionDefaults?: (region: RegionKey) => void; // smart apply (optional)
  onForceApplyRegionDefaults?: (region: RegionKey) => void; // force overwrite (optional)
  // optionally the parent can pass the last-applied defaults to indicate custom fields
  appliedDefaults?: Partial<Record<string, any>>;
}

const REGION_OPTIONS: { key: RegionKey; label: string }[] = [
  { key: "UK", label: "United Kingdom" },
  { key: "US", label: "United States" },
  { key: "EU", label: "European Union" },
  { key: "CA", label: "Canada" },
];
declare global {
  interface Window {
    google: any;
  }
}
const STANDARDS_OPTIONS: { key: StandardsMode; label: string }[] = [
  { key: "generic", label: "Generic" },
  { key: "BS_EN_12831", label: "BS EN 12831" },
  { key: "ASHRAE", label: "ASHRAE" },
  { key: "EN_ISO_13790", label: "EN / ISO 13790" },
  { key: "CSA_F280", label: "CSA F280" },
];

export const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onUpdate,
  onApplyRegionDefaults,
  onForceApplyRegionDefaults,
  appliedDefaults,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Determine a friendly badge text
  const regionLabel = project.region ? project.region : "Not selected";
  const standardsLabel = project.standardsMode ?? "generic";
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  // 🧭 Auto-fetch location & set address only for NEW projects
  useEffect(() => {
    if (project.id) return; // skip for existing projects

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
            }`
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
        setError("Unable to fetch your location. Please allow access.");
      }
    );
  }, [project.id]);

  // 📍 Setup Google Autocomplete (for manual search)
  useEffect(() => {
    // if (project.id) return; // skip for existing projects

    // ✅ Setup Google Autocomplete when script is ready
    const initAutocomplete = () => {
      if (!window.google || !inputRef.current) return;

      const options = {
        fields: ["geometry", "formatted_address"],
        types: ["address"],
      };

      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current,
        options
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

    // Wait until script loads if not yet available
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

  // Standards options can be filtered or prioritized by region if desired
  const standardsForRegion = useMemo(() => {
    if (project.region === "UK") {
      return STANDARDS_OPTIONS; // we could prioritize BS_EN_12831
    }
    // default: return whole list
    return STANDARDS_OPTIONS;
  }, [project.region]);

  // helper to detect if a field differs from applied defaults (if parent provided them)
  const isCustom = (k: string) => {
    if (!appliedDefaults) return false;
    return (
      typeof appliedDefaults[k] !== "undefined" &&
      project[k] !== appliedDefaults[k]
    );
  };

  // Small field renderer for numeric advanced fields
  const numericField = (
    label: string,
    fieldKey: keyof ProjectHeader & string,
    value: number | undefined,
    opts?: { min?: number; max?: number; step?: number; hint?: string }
  ) => (
    <Field label={`${label}${isCustom(fieldKey) ? " (custom)" : ""}`}>
      <input
        type="number"
        className="w-full border border-slate-300 rounded-md px-3 py-2"
        value={value ?? ""}
        min={opts?.min}
        max={opts?.max}
        step={opts?.step ?? 0.1}
        onChange={(e) => {
          const v = e.target.value === "" ? undefined : Number(e.target.value);
          onUpdate({ [fieldKey]: v } as Partial<ProjectHeader>);
        }}
        aria-describedby={`${fieldKey}-help`}
      />
      {opts?.hint && (
        <div id={`${fieldKey}-help`} className="text-xs text-slate-500 mt-1">
          {opts.hint}
        </div>
      )}
    </Field>
  );

  return (
    <SectionCard title="Project">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project Name">
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2 cursor-text"
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

        {/* Region & Standards — new controls */}
        <Field label="Region">
          <div className="flex gap-2 items-center">
            <select
              value={project.region ?? ""}
              onChange={(e) => {
                const region = e.target.value as RegionKey;
                // Update project
                onUpdate({ region });

                // Optional: auto-apply defaults for this region
                if (REGION_DEFAULTS[region]) {
                  const defaults = REGION_DEFAULTS[region];
                  onUpdate({ ...defaults });
                }
              }}
            >
              <option value="">Select region</option>
              {REGION_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-500 mt-1">
            Using: <span className="font-semibold">{regionLabel}</span> —{" "}
            <span className="font-medium">{standardsLabel}</span>
          </div>
        </Field>
        <Field label="Address">
          <input
            ref={inputRef} // ✅ important for autocomplete
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            defaultValue={project.address ?? ""}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="Street, City, State/Province, Postal Code"
          />
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </Field>

        <Field label="Standards Mode">
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
          <div className="text-xs text-slate-500 mt-1">
            Choose a standards mode to apply design multipliers and rules.
          </div>
        </Field>

        {/* Design Temperature controls (kept here; unchanged logic) */}
        <Field label={`Indoor (${project.units === "metric" ? "°C" : "°F"})`}>
          <input
            type="number"
            step="0.5"
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={project.designIndoorC ?? ""}
            onChange={(e) =>
              onUpdate({ designIndoorC: Number(e.target.value) })
            }
          />
        </Field>

        <Field label={`Outdoor (${project.units === "metric" ? "°C" : "°F"})`}>
          <input
            type="number"
            step="0.5"
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={project.designOutdoorC ?? ""}
            onChange={(e) =>
              onUpdate({ designOutdoorC: Number(e.target.value) })
            }
          />
        </Field>

        {/* Insulation Period */}
        {/* Insulation Period */}
        <Field label="Insulation Period">
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={project.period ?? ""}
            onChange={(e) => onUpdate({ period: e.target.value as PeriodKey })}
          >
            <option value="pre1980">Pre-1980 (Poor)</option>
            <option value="y1980_2000">1980–2000 (Average)</option>
            <option value="y2001_2015">2001–2015 (Good)</option>
            <option value="y2016p">2016+ (Efficient)</option>
          </select>
        </Field>

        {/* Advanced Defaults — collapsible */}
        <div className="mt-4">
          <div className="mt-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-sm font-medium text-slate-700">
                Advanced Defaults
              </h3>
              <button
                type="button"
                className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors"
                onClick={() => setAdvancedOpen((s) => !s)}
                aria-expanded={advancedOpen}
              >
                {advancedOpen ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {advancedOpen && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              {numericField(
                "Safety Factor (%)",
                "safetyFactorPct",
                project.safetyFactorPct as number | undefined,
                {
                  min: 0,
                  max: 100,
                  step: 0.1,
                  hint: "Typical 10–15%",
                }
              )}

              {numericField(
                "Heat-up Factor (%)",
                "heatUpFactorPct",
                project.heatUpFactorPct as number | undefined,
                {
                  min: 0,
                  max: 200,
                  step: 0.1,
                  hint: "Warm-up multiplier (typical 20–30%)",
                }
              )}

              {numericField(
                "Psi allowance (W/K)",
                "psiAllowance_W_per_K",
                project.psiAllowance_W_per_K as number | undefined,
                {
                  min: 0,
                  max: 1,
                  step: 0.005,
                  hint: "Thermal bridging allowance (W/K)",
                }
              )}

              {numericField(
                "Mechanical Vent. (m³/h)",
                "mechVent_m3_per_h",
                project.mechVent_m3_per_h as number | undefined,
                {
                  min: 0,
                  max: 5,
                  step: 0.01,
                  hint: "m³/h per m² or system-specific (region-dependent)",
                }
              )}

              {numericField(
                "Infiltration (ACH)",
                "infiltrationACH",
                project.infiltrationACH as number | undefined,
                {
                  min: 0,
                  max: 5,
                  step: 0.01,
                  hint: "Air changes per hour (typical 0.2–0.5)",
                }
              )}

              <Field
                label={`Floor On Ground ${
                  isCustom("floorOnGround" as any) ? "(custom)" : ""
                }`}
              >
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(project.floorOnGround)}
                    onChange={(e) =>
                      onUpdate({ floorOnGround: e.target.checked })
                    }
                    className="h-4 w-4 accent-teal-600 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700 select-none">
                    Yes — floor on ground
                  </span>
                </div>
              </Field>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
};
