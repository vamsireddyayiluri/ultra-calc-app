import type { V2ProjectMetadataExtraction } from "../api/experimentalV2Client";
import type { GlazingType, HeatingSystem, InsulationPeriodKey, Region } from "../../models/projectTypes";
import { REGION_DEFAULTS } from "../../data/regionDefaults";
import { getDefaultUValues } from "../../utils/uDefaults";
import type { EditableProject } from "../../utils/projectFactory";

export interface ProjectMetadataDraft {
  name: string;
  address: string;
  contractor: string;
  region: Region | "";
  heatingSystem: HeatingSystem | "";
  indoorTempC: number | null;
  outdoorTempC: number | null;
  insulationPeriod: InsulationPeriodKey | "";
  glazing: GlazingType | "";
}

export const EMPTY_PROJECT_METADATA_DRAFT: ProjectMetadataDraft = {
  name: "",
  address: "",
  contractor: "",
  region: "",
  heatingSystem: "",
  indoorTempC: null,
  outdoorTempC: null,
  insulationPeriod: "",
  glazing: "",
};

type DraftKey = keyof ProjectMetadataDraft;

// Seeds a draft from newly-arrived extracted metadata without ever
// overwriting a field the reviewer has already edited - mirrors the same
// never-clobber pattern already used for streaming room batches.
export function seedProjectMetadataDraft(
  draft: ProjectMetadataDraft,
  touched: ReadonlySet<DraftKey>,
  metadata: V2ProjectMetadataExtraction | null,
): ProjectMetadataDraft {
  if (!metadata) return draft;
  const next = { ...draft };
  let changed = false;
  const setIfUntouched = <K extends DraftKey>(key: K, value: ProjectMetadataDraft[K] | null | undefined) => {
    if (touched.has(key) || value == null || next[key]) return;
    next[key] = value;
    changed = true;
  };
  setIfUntouched("name", metadata.project_name?.raw_text);
  setIfUntouched("address", metadata.project_address?.raw_text);
  setIfUntouched("contractor", metadata.contractor_or_architect?.raw_text);
  setIfUntouched("region", (metadata.suggested_region?.mapped_value ?? undefined) as Region | undefined);
  setIfUntouched("heatingSystem", (metadata.heating_system?.mapped_value ?? undefined) as HeatingSystem | undefined);
  setIfUntouched("indoorTempC", metadata.indoor_design_temp_c?.value);
  setIfUntouched("outdoorTempC", metadata.outdoor_design_temp_c?.value);
  setIfUntouched(
    "insulationPeriod",
    (metadata.insulation_period?.mapped_value ?? undefined) as InsulationPeriodKey | undefined,
  );
  setIfUntouched("glazing", (metadata.glazing?.mapped_value ?? undefined) as GlazingType | undefined);
  return changed ? next : draft;
}

// Applies only the fields the reviewer actually confirmed/edited onto a fresh
// draft project, recomputing region-dependent defaults (standards mode, U-values)
// exactly like ProjectForm's own region-change handler does.
export function applyProjectMetadataOverrides(
  project: EditableProject,
  draft: ProjectMetadataDraft,
): EditableProject {
  const next: EditableProject = { ...project };
  if (draft.name.trim()) next.name = draft.name.trim();
  if (draft.address.trim()) next.address = draft.address.trim();
  if (draft.contractor.trim()) next.contractor = draft.contractor.trim();
  if (draft.heatingSystem) next.heatingSystem = draft.heatingSystem;
  if (draft.indoorTempC != null) next.indoorTempC = draft.indoorTempC;
  if (draft.outdoorTempC != null) next.outdoorTempC = draft.outdoorTempC;
  if (draft.insulationPeriod) next.insulationPeriod = draft.insulationPeriod;
  if (draft.glazing) next.glazing = draft.glazing;
  if (draft.region) {
    next.region = draft.region;
    Object.assign(next, REGION_DEFAULTS[draft.region]);
  }
  if (draft.region || draft.insulationPeriod) {
    next.customUOverrides = getDefaultUValues({
      region: next.region,
      standardsMode: next.standardsMode,
      insulationPeriod: next.insulationPeriod,
    });
  }
  return next;
}
