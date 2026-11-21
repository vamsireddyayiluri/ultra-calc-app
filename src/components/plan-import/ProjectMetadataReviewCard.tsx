import type {
  V2ExtractedEnumValue,
  V2ExtractedNumericValue,
  V2FieldEvidence,
  V2ProjectMetadataExtraction,
} from "../../plan-import/api/experimentalV2Client";
import type { GlazingType, HeatingSystem, InsulationPeriodKey, Region } from "../../models/projectTypes";
import { REGION_OPTIONS } from "../../models/presets";
import { HEATING_SYSTEM_LABELS } from "../../utils/heatingSystem";
import type { ProjectMetadataDraft } from "../../plan-import/pipeline/projectMetadataDraft";

const INSULATION_PERIOD_OPTIONS: { key: InsulationPeriodKey; label: string }[] = [
  { key: "pre1980", label: "Pre-1980 (Poor)" },
  { key: "y1980_2000", label: "1980\u20132000 (Average)" },
  { key: "y2001_2015", label: "2001\u20132015 (Good)" },
  { key: "y2016p", label: "2016+ (Efficient)" },
];

const GLAZING_OPTIONS: { key: GlazingType; label: string }[] = [
  { key: "single", label: "Single" },
  { key: "double", label: "Double" },
  { key: "triple", label: "Triple" },
];

function EvidenceNote({ evidence, unmatchedRawText }: { evidence?: V2FieldEvidence | null; unmatchedRawText?: string | null }) {
  if (unmatchedRawText) {
    return (
      <p className="mt-1 text-[11px] text-amber-700">
        Found "{unmatchedRawText}" on the plan — couldn't confidently match it, please choose manually.
      </p>
    );
  }
  if (!evidence) return null;
  return <p className="mt-1 text-[11px] text-slate-500">Found on the plan: "{evidence.raw_text}"</p>;
}

interface Props {
  metadata: V2ProjectMetadataExtraction | null;
  draft: ProjectMetadataDraft;
  status: "running" | "complete";
  onChange: (patch: Partial<ProjectMetadataDraft>) => void;
}

// Streams independently of room batches, typically resolving within the
// first few seconds (only needs the title/mechanical sheet, not every
// floor-plan page) - renders above the room review queue so the estimator
// can start confirming project-level fields while rooms are still scanning.
export default function ProjectMetadataReviewCard({ metadata, draft, status, onChange }: Props) {
  // Backend fills this object in field-by-field as sheets stream in (first
  // confident value per field wins), so early on it may exist but still have
  // every field null. Some plan PDFs never carry a title/mechanical sheet at
  // all, so rather than showing a wall of empty inputs the moment scanning
  // starts, wait until at least one field has actually resolved before
  // surfacing the card - whether that happens mid-scan or only once complete.
  const hasAnyExtractedValue = metadata
    ? Object.entries(metadata).some(([key, value]) => key !== "schema_version" && value != null)
    : false;
  if (!hasAnyExtractedValue) return null;

  const heatingSystemEnum: V2ExtractedEnumValue | null = metadata?.heating_system ?? null;
  const insulationEnum: V2ExtractedEnumValue | null = metadata?.insulation_period ?? null;
  const glazingEnum: V2ExtractedEnumValue | null = metadata?.glazing ?? null;
  const regionEnum: V2ExtractedEnumValue | null = metadata?.suggested_region ?? null;
  const indoorTemp: V2ExtractedNumericValue | null = metadata?.indoor_design_temp_c ?? null;
  const outdoorTemp: V2ExtractedNumericValue | null = metadata?.outdoor_design_temp_c ?? null;

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-emerald-950">Project details found on this plan</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase text-emerald-700" role="status">
          {status === "complete" ? "Review and confirm" : "Scanning title sheet\u2026"}
        </span>
      </div>
      <p className="mt-1 text-xs text-emerald-900">
        Edit anything below before creating the project — nothing here is saved until you confirm.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Project name
          <input
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
          />
          <EvidenceNote evidence={metadata?.project_name} />
        </label>

        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Address
          <input
            value={draft.address}
            onChange={(event) => onChange({ address: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
          />
          <EvidenceNote evidence={metadata?.project_address} />
        </label>

        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Contractor / architect
          <input
            value={draft.contractor}
            onChange={(event) => onChange({ contractor: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
          />
          <EvidenceNote evidence={metadata?.contractor_or_architect} />
        </label>

        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Region
          <select
            value={draft.region}
            onChange={(event) => onChange({ region: event.target.value as Region })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
          >
            <option value="">Select a region</option>
            {REGION_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          {regionEnum?.mapped_value && draft.region !== regionEnum.mapped_value ? (
            <button
              type="button"
              onClick={() => onChange({ region: regionEnum.mapped_value as Region })}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
            >
              Suggested from address: {REGION_OPTIONS.find((option) => option.key === regionEnum.mapped_value)?.label ?? regionEnum.mapped_value} — use this
            </button>
          ) : (
            <EvidenceNote evidence={regionEnum?.evidence} />
          )}
        </label>

        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Heat source
          <select
            value={draft.heatingSystem}
            onChange={(event) => onChange({ heatingSystem: event.target.value as HeatingSystem })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
          >
            <option value="">Select a heat source</option>
            <option value="STANDARD">{HEATING_SYSTEM_LABELS.STANDARD}</option>
            <option value="HEAT_PUMP">{HEATING_SYSTEM_LABELS.HEAT_PUMP}</option>
          </select>
          <EvidenceNote
            evidence={heatingSystemEnum?.mapped_value ? heatingSystemEnum.evidence : null}
            unmatchedRawText={!heatingSystemEnum?.mapped_value ? heatingSystemEnum?.raw_text : null}
          />
        </label>

        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Insulation period
          <select
            value={draft.insulationPeriod}
            onChange={(event) => onChange({ insulationPeriod: event.target.value as InsulationPeriodKey })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
          >
            <option value="">Select an insulation period</option>
            {INSULATION_PERIOD_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <EvidenceNote
            evidence={insulationEnum?.mapped_value ? insulationEnum.evidence : null}
            unmatchedRawText={!insulationEnum?.mapped_value ? insulationEnum?.raw_text : null}
          />
        </label>

        <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          Glazing type
          <select
            value={draft.glazing}
            onChange={(event) => onChange({ glazing: event.target.value as GlazingType })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-slate-900"
          >
            <option value="">Select a glazing type</option>
            {GLAZING_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <EvidenceNote
            evidence={glazingEnum?.mapped_value ? glazingEnum.evidence : null}
            unmatchedRawText={!glazingEnum?.mapped_value ? glazingEnum?.raw_text : null}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
            Indoor design temp (°C)
            <input
              type="number"
              value={draft.indoorTempC ?? ""}
              onChange={(event) => onChange({ indoorTempC: event.target.value === "" ? null : Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
            />
            <EvidenceNote evidence={indoorTemp?.evidence} />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
            Outdoor design temp (°C)
            <input
              type="number"
              value={draft.outdoorTempC ?? ""}
              onChange={(event) => onChange({ outdoorTempC: event.target.value === "" ? null : Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
            />
            <EvidenceNote evidence={outdoorTemp?.evidence} />
          </label>
        </div>
      </div>
    </div>
  );
}
