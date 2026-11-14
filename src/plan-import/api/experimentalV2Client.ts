import { auth } from "../../firebase";

async function v2Fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  await auth.authStateReady();
  const user = auth.currentUser;
  if (user) headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  return fetch(input, { ...init, headers });
}

export interface V2ReviewSessionDraft {
  schema_version: "plan-review-session/1.0";
  run_id: string;
  room_reviews: Record<string, import("../pipeline/convertV2ReviewToRoomInput").V2RoomReviewSelection>;
  review_session_id: string;
  review_started_at: string;
  correction_keys: string[];
  active_review_ms: number;
}

export async function getV2ReviewDraft(baseUrl: string, token: string): Promise<{ revision: number; draft: V2ReviewSessionDraft | null }> {
  const response = await v2Fetch(`${baseUrl.replace(/\/$/, "")}/api/experimental/v2/artifacts/${encodeURIComponent(token)}/reviews/draft`);
  if (!response.ok) throw await errorFromResponse(response);
  return response.json();
}

export async function saveV2ReviewDraft(baseUrl: string, token: string, expectedRevision: number, draft: V2ReviewSessionDraft): Promise<{ revision: number }> {
  const response = await v2Fetch(`${baseUrl.replace(/\/$/, "")}/api/experimental/v2/artifacts/${encodeURIComponent(token)}/reviews/draft`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_revision: expectedRevision, draft }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  return response.json();
}

export type V2VerificationState =
  | "unverified"
  | "machine_supported"
  | "machine_conflicted"
  | "abstained"
  | "human_verified"
  | "human_rejected";

export interface V2Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface V2Point { x: number; y: number }

export interface V2SpanEndpoints {
  start: V2Point;
  end: V2Point;
  space_id: string;
}

export interface V2AffineTransform {
  from_space_id: string;
  to_space_id: string;
  matrix: [number, number, number, number, number, number, number, number, number];
  inverse_matrix: [number, number, number, number, number, number, number, number, number];
}

export interface V2SourceLocation {
  page_id: string;
  image_id: string | null;
  pdf_points: V2Box | null;
  page_pixels: V2Box | null;
  region_pixels: V2Box | null;
  model_normalized: V2Box | null;
}

export interface V2ProviderUsage {
  request_id: string;
  operation: string;
  provider: string;
  model: string;
  status: "success" | "error";
  latency_seconds: number;
  attempt_count: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  pricing_basis: string | null;
  error: string | null;
}

export interface V2TextObservation {
  observation_id: string;
  page_id: string;
  view_id: string | null;
  kind: "room_label" | "dimension_text" | "scale_note" | "floor_label" | "revision_label" | "other";
  raw_text: string;
  source: "native_text" | "ocr" | "visual";
  read_state: "readable" | "ambiguous" | "unreadable";
  location: V2SourceLocation;
  provider_confidence: number | null;
  evidence: string[];
}

export interface V2RoomInstance {
  room_id: string;
  page_id: string;
  view_id: string;
  label_observation_ids: string[];
  location: V2SourceLocation;
  verification_state: V2VerificationState;
  /** Classification is advisory; the reviewer makes the final inclusion decision. */
  space_category?: "room" | "service" | "storage" | "circulation" | "exterior" | "annotation" | "unknown";
  /** Older persisted evidence may omit this additive contract field. */
  import_eligibility?: "eligible" | "requires_review";
  evidence_ids: string[];
}

export interface V2ParsedDimension {
  value: number;
  unit: "ft" | "in" | "m" | "cm" | "mm";
  decimal_feet: number;
  meters: number;
  normalized_text: string;
}

export interface V2DimensionEvidence {
  dimension_id: string;
  page_id: string;
  view_id: string;
  origin: "printed" | "scale_measured" | "derived" | "user_entered";
  observation_id: string | null;
  raw_text: string | null;
  parsed: V2ParsedDimension | null;
  orientation: "horizontal" | "vertical" | "slanted" | "unknown";
  read_state: "readable" | "ambiguous" | "unreadable";
  location: V2SourceLocation | null;
  verification_state: V2VerificationState;
  span_endpoints: V2SpanEndpoints | null;
  source_reference_ids: string[];
  /** Present when one printed `length x width` label was split deterministically. */
  compound_pair_id?: string | null;
  compound_pair_component?: "length" | "width" | null;
}

export interface V2RoomDimensionAssociation {
  association_id: string;
  room_id: string;
  dimension_id: string;
  span_type: "room_span" | "partial_span" | "overall_building_span" | "opening" | "wall_thickness" | "unknown";
  ownership_state: "proposed" | "supported" | "contradicted" | "unresolved";
  proposed_by: "native_text" | "ocr" | "visual";
  stage: "discovery" | "room_verification" | "human_review";
  verified_orientation: "horizontal" | "vertical" | "slanted" | "unknown" | null;
  verification_observation_id: string | null;
  verification_state: V2VerificationState;
  span_endpoints: V2SpanEndpoints | null;
  evidence_ids: string[];
  explanation: string | null;
}

export interface V2ApplicationDimensionMapping {
  axis: "length" | "width";
  dimension_id: string | null;
  association_id: string | null;
  origin: "printed" | "scale_measured" | "derived" | "user_entered" | null;
  verification_state: V2VerificationState;
}

export interface V2RoomApplicationMapping {
  room_id: string;
  length: V2ApplicationDimensionMapping;
  width: V2ApplicationDimensionMapping;
  page_horizontal_candidate_association_ids: string[];
  page_vertical_candidate_association_ids: string[];
  /** Explicit application-axis candidates from printed compound room-size labels. */
  length_candidate_association_ids?: string[];
  width_candidate_association_ids?: string[];
  review_required: boolean;
  review_reasons: string[];
}

export interface V2ExtractionResult {
  schema_version: "plan-evidence/2.0";
  pipeline_version: string;
  run: {
    run_id: string;
    started_at: string;
    completed_at: string | null;
    processing_time_seconds: number | null;
    artifact_access_token: string | null;
    settings: Record<string, unknown>;
    prompt_hashes: Record<string, string>;
    provider_usage: V2ProviderUsage[];
  };
  document: {
    document_id: string;
    filename: string;
    mime_type: "application/pdf";
    sha256: string;
    page_ids: string[];
  };
  pages: Array<{
    page_id: string;
    document_id: string;
    source_page_number: number;
    pdf_box: V2Box;
    rotation_degrees: 0 | 90 | 180 | 270;
    transforms: V2AffineTransform[];
  }>;
  views: Array<{
    view_id: string;
    page_id: string;
    view_type: "floor_plan" | "unknown";
    floor_label_observation_ids: string[];
    revision_label_observation_ids: string[];
    location: V2SourceLocation;
    verification_state: V2VerificationState;
  }>;
  images: Array<{
    image_id: string;
    page_id: string;
    view_id: string | null;
    role: "overview" | "region";
    mime_type: "image/png";
    sha256: string;
    width_pixels: number;
    height_pixels: number;
    render_dpi: number;
    source_pdf_box: V2Box;
    transforms: V2AffineTransform[];
  }>;
  text_observations: V2TextObservation[];
  rooms: V2RoomInstance[];
  dimensions: V2DimensionEvidence[];
  associations: V2RoomDimensionAssociation[];
  application_mappings: V2RoomApplicationMapping[];
  warnings: Array<{ code: string; message: string; evidence_ids: string[] }>;
}

export interface V2ExtractionOptions {
  page_numbers?: number[];
  include_native_text_hints?: boolean;
  run_room_verification?: boolean;
}

export type ExperimentalV2Pipeline = "v2-gemini" | "v24-luna" | "v25-luna" | "v26-luna" | "v27-luna" | "v28-luna" | "v29-luna" | "v210-luna";

export interface V2ExtractionJobStart {
  job_id: string;
  status: "queued";
  status_url: string;
}

export interface V2PartialRoomSummary {
  room_id: string;
  label_text: string | null;
  space_category: "room" | "service" | "storage" | "circulation" | "exterior" | "annotation" | "unknown";
  import_eligibility: "eligible" | "requires_review";
  verification_state: V2VerificationState;
}

export interface V2PartialEvidenceSnapshot {
  schema_version: "plan-evidence-partial/1.0";
  stage: string;
  progress: number;
  elapsed_seconds: number;
  room_count: number;
  dimension_count: number;
  association_count: number;
  warning_count: number;
  rooms: V2PartialRoomSummary[];
}

export interface V2ExtractionJobStatus {
  job_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
  stage: string;
  progress: number;
  cancellation_requested: boolean;
  result: V2ExtractionResult | null;
  error: string | null;
  // Best-effort, in-progress preview (see PartialEvidenceSnapshot backend contract) -
  // only meaningfully populated while status is "running" (or after a failure/
  // cancellation that still has evidence worth showing).
  partial_snapshot: V2PartialEvidenceSnapshot | null;
}

export interface V2ReviewMetric {
  run_id: string;
  session_id: string;
  event: "review_started" | "review_completed";
  elapsed_ms: number;
  active_review_ms?: number;
  room_count: number;
  accepted_count: number;
  excluded_count: number;
  correction_count: number;
}

export interface V2ReviewAxisDraft {
  kind: "evidence" | "human_correction" | "missing";
  association_id?: string | null;
  raw_text?: string | null;
  source_association_id?: string | null;
}

export interface V2ReviewRoomDraft {
  review_room_id: string;
  source_room_id: string | null;
  source_page_number: number;
  decision: "pending" | "accepted" | "excluded";
  reviewed_name: string;
  duplicate_of_review_room_id: string | null;
  length: V2ReviewAxisDraft;
  width: V2ReviewAxisDraft;
}

export interface V2ReviewValidation {
  schema_version: "plan-review-validation/1.0";
  evidence_run_id: string;
  rooms: Array<{
    review_room_id: string;
    source_room_id: string | null;
    source_page_number: number;
    decision: "pending" | "accepted" | "excluded";
    reviewed_name: string;
    duplicate_of_review_room_id: string | null;
    length: { kind: V2ReviewAxisDraft["kind"]; raw_text: string | null; meters: number | null; origin: "printed" | "user_entered" | null; association_id: string | null; dimension_id: string | null; evidence_ids: string[] };
    width: { kind: V2ReviewAxisDraft["kind"]; raw_text: string | null; meters: number | null; origin: "printed" | "user_entered" | null; association_id: string | null; dimension_id: string | null; evidence_ids: string[] };
  }>;
}

export class ExperimentalV2Error extends Error {}

export function experimentalV2EvidenceImageUrl(baseUrl: string, token: string, imageId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/experimental/v2/artifacts/${encodeURIComponent(token)}/images/${encodeURIComponent(imageId)}`;
}

export async function validateV2Review(
  baseUrl: string,
  token: string,
  runId: string,
  rooms: V2ReviewRoomDraft[],
): Promise<V2ReviewValidation> {
  const response = await v2Fetch(
    `${baseUrl.replace(/\/$/, "")}/api/experimental/v2/artifacts/${encodeURIComponent(token)}/reviews/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema_version: "plan-review-draft/1.0", run_id: runId, rooms }),
    },
  );
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as V2ReviewValidation;
}

export async function recordV2ReviewMetric(
  baseUrl: string,
  token: string,
  metric: V2ReviewMetric,
): Promise<void> {
  const response = await v2Fetch(
    `${baseUrl.replace(/\/$/, "")}/api/experimental/v2/artifacts/${encodeURIComponent(token)}/review-metrics`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metric),
      keepalive: true,
    },
  );
  if (!response.ok) throw await errorFromResponse(response);
}

async function errorFromResponse(response: Response): Promise<ExperimentalV2Error> {
  let detail = response.statusText || "Request failed";
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const candidate = body.detail ?? body.error;
    detail = typeof candidate === "string" ? candidate : JSON.stringify(candidate ?? detail);
  } catch {
    // Keep the HTTP status text when the backend did not return JSON.
  }
  console.error(`V2 extraction request failed (${response.status}): ${detail}`);
  return new ExperimentalV2Error("We couldn't complete this scan right now. Please try again in a moment.");
}

export async function extractPlanRegionsV2(
  file: File,
  baseUrl: string,
  options: V2ExtractionOptions,
  pipeline: ExperimentalV2Pipeline = "v2-gemini",
): Promise<V2ExtractionResult> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("options", JSON.stringify(options));

  let response: Response;
  const endpoint = pipeline === "v210-luna"
    ? "/api/experimental/v2/plans/extract-regions-v210-luna"
    : pipeline === "v29-luna"
    ? "/api/experimental/v2/plans/extract-regions-v29-luna"
    : pipeline === "v28-luna"
    ? "/api/experimental/v2/plans/extract-regions-v28-luna"
    : pipeline === "v27-luna"
    ? "/api/experimental/v2/plans/extract-regions-v27-luna"
    : pipeline === "v26-luna"
    ? "/api/experimental/v2/plans/extract-regions-v26-luna"
    : pipeline === "v25-luna"
    ? "/api/experimental/v2/plans/extract-regions-v25-luna"
    : pipeline === "v24-luna"
      ? "/api/experimental/v2/plans/extract-regions-v24-luna"
      : "/api/experimental/v2/plans/extract-regions";
  try {
    response = await v2Fetch(`${baseUrl.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      body: formData,
    });
  } catch (networkError) {
    console.error("V2 extraction network failure:", baseUrl, networkError);
    throw new ExperimentalV2Error("We couldn't reach the scanning service. Check your connection and try again.");
  }

  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as V2ExtractionResult;
}

export async function startLunaExtractionJob(
  file: File,
  baseUrl: string,
  options: V2ExtractionOptions,
  pipeline: "v24-luna" | "v25-luna" | "v26-luna" | "v27-luna" | "v28-luna" | "v29-luna" | "v210-luna",
): Promise<V2ExtractionJobStart> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("options", JSON.stringify(options));
  let response: Response;
  try {
    response = await v2Fetch(
      `${baseUrl.replace(/\/$/, "")}/api/experimental/v2/plans/extract-regions-${pipeline}/jobs`,
      { method: "POST", body: formData },
    );
  } catch (networkError) {
    console.error("V2 job start network failure:", baseUrl, networkError);
    throw new ExperimentalV2Error("We couldn't start this scan. Check your connection and try again.");
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as V2ExtractionJobStart;
}

export async function getLunaExtractionJob(
  baseUrl: string,
  jobId: string,
): Promise<V2ExtractionJobStatus> {
  let response: Response;
  try {
    response = await v2Fetch(
      `${baseUrl.replace(/\/$/, "")}/api/experimental/v2/plans/jobs/${encodeURIComponent(jobId)}`,
      { cache: "no-store" },
    );
  } catch (networkError) {
    console.error("V2 job status network failure:", baseUrl, jobId, networkError);
    throw new ExperimentalV2Error("We couldn't check the status of this scan. Check your connection and try again.");
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as V2ExtractionJobStatus;
}

export async function cancelLunaExtractionJob(
  baseUrl: string,
  jobId: string,
): Promise<V2ExtractionJobStatus> {
  let response: Response;
  try {
    response = await v2Fetch(
      `${baseUrl.replace(/\/$/, "")}/api/experimental/v2/plans/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE" },
    );
  } catch (networkError) {
    console.error("V2 job cancel network failure:", baseUrl, jobId, networkError);
    throw new ExperimentalV2Error("We couldn't cancel this scan. Please try again.");
  }
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as V2ExtractionJobStatus;
}
