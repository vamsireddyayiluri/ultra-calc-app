import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCheck2, LoaderCircle, Plus, ScanLine, Square } from "lucide-react";
import {
  cancelLunaExtractionJob,
  extractPlanRegionsV2,
  getLunaExtractionJob,
  getV2ReviewDraft,
  saveV2ReviewDraft,
  recordV2ReviewMetric,
  startLunaExtractionJob,
  validateV2Review,
  ExperimentalV2Error,
  type V2ExtractionResult,
  type V2PartialEvidenceSnapshot,
  type V2ProjectMetadataExtraction,
  type V2RoomInstance,
  type ExperimentalV2Pipeline,
} from "../../plan-import/api/experimentalV2Client";
import {
  buildV2ReviewDraftRooms,
  prepareV2ReviewedImport,
  type PreparedV2ReviewedImport,
  type V2RoomReviewSelection,
} from "../../plan-import/pipeline/convertV2ReviewToRoomInput";
import {
  EMPTY_PROJECT_METADATA_DRAFT,
  seedProjectMetadataDraft,
  type ProjectMetadataDraft,
} from "../../plan-import/pipeline/projectMetadataDraft";
import RoomReviewWorkbench, { axisDisplayValue } from "./RoomReviewWorkbench";
import ReadyRoomRow from "./ReadyRoomRow";
import ProjectMetadataReviewCard from "./ProjectMetadataReviewCard";
import { eligibleV2Associations, isEligibleV2Association } from "../../plan-import/pipeline/v2Eligibility";
import { auth } from "../../firebase";
import { ConfirmDialog } from "../layout/ConfirmDialog";
import type { Region } from "../../models/projectTypes";

interface ExperimentalV2PanelProps {
  file: File | null;
  pageCount: number | null;
  backendUrl: string;
  isCreatingProject: boolean;
  onCreateDraftProject: (prepared: PreparedV2ReviewedImport, projectMetadata: ProjectMetadataDraft) => Promise<void>;
  debugMode?: boolean;
  // The existing project's region, when appending to an already-created
  // project (AppendPlanImportPage) - takes priority over the Phase A
  // suggested/confirmed region draft used during new-project import.
  knownRegion?: Region;
}

type RunStatus = "idle" | "running" | "complete" | "error" | "cancelled";
type PageScope = "selected" | "all";

const V2_SESSION_STORAGE_KEY = "ultra-calc:plan-import:v2-result:v4";
const V2_JOB_STORAGE_KEY = "ultra-calc:plan-import:v2-luna-job:v2";
// Stop auto-polling after this long so a dead backend worker can't leave the
// user staring at a spinner forever - "Check again" below resumes polling.
const POLL_MAX_DURATION_MS = 20 * 60 * 1000;
function ownedStorageKey(base: string): string {
  return `${base}:${auth.currentUser?.uid ?? "local"}`;
}

interface PersistedV2Session {
  version: 5;
  ownerUid: string | null;
  savedAt: string;
  fileFingerprint: string | null;
  pipeline: ExperimentalV2Pipeline;
  result: V2ExtractionResult;
  roomReviews: Record<string, V2RoomReviewSelection>;
  reviewSessionId: string;
  reviewStartedAt: string;
  correctionKeys: string[];
  reviewCompletedMetricSent: boolean;
  reviewRevision?: number;
  reviewSyncPending?: boolean;
  activeReviewMs?: number;
  projectMetadataDraft?: ProjectMetadataDraft;
}

interface PersistedV2Job {
  version: 3;
  ownerUid: string | null;
  jobId: string;
  backendUrl: string;
  fileName: string;
  fileFingerprint: string;
  startedAt: string;
  statusUrl: string;
  pipeline: "v24-luna" | "v25-luna" | "v26-luna" | "v27-luna" | "v28-luna" | "v29-luna" | "v210-luna";
  // Room reviews build up as incremental extraction snapshots stream in, and
  // the reviewer can edit/accept/reject them in the workbench while the scan
  // is still "running" (see activeWorkbenchResult = result ?? incrementalResult
  // below) - persist those in-progress edits against this jobId too, not just
  // the completed-run session backup, so refreshing mid-scan doesn't silently
  // discard them once polling resumes and re-seeds only the missing rooms.
  roomReviews?: Record<string, V2RoomReviewSelection>;
  projectMetadataDraft?: ProjectMetadataDraft;
  correctionKeys?: string[];
  reviewSessionId?: string;
  reviewStartedAt?: string;
}

function newReviewSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function readPersistedV2Session(): PersistedV2Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ownedStorageKey(V2_SESSION_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedV2Session>;
    if (parsed.ownerUid !== (auth.currentUser?.uid ?? null)) return null;
    if (parsed.version !== 5 || !parsed.result || !parsed.pipeline || !parsed.roomReviews) return null;
    return parsed as PersistedV2Session;
  } catch {
    return null;
  }
}

function clearPersistedV2Session() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ownedStorageKey(V2_SESSION_STORAGE_KEY));
}

function buildRoomReview(
  extracted: V2ExtractionResult,
  room: V2RoomInstance,
): V2RoomReviewSelection {
  const observations = new Map(
    extracted.text_observations.map((observation) => [observation.observation_id, observation]),
  );
  const lengths = eligibleV2Associations(extracted, room.room_id, "length");
  const widths = eligibleV2Associations(extracted, room.room_id, "width");
  const sourcePageNumber = extracted.pages.find((page) => page.page_id === room.page_id)?.source_page_number;
  if (!sourcePageNumber) throw new Error(`Room ${room.room_id} does not belong to an extracted source page.`);
  return {
    reviewRoomId: room.room_id,
    sourceRoomId: room.room_id,
    sourcePageNumber,
    decision: "pending",
    name: room.label_observation_ids.map((id) => observations.get(id)?.raw_text).filter(Boolean).join(" / "),
    duplicateOfReviewRoomId: "",
    length: {
      kind: lengths.length === 1 ? "evidence" : "missing",
      associationId: lengths.length === 1 ? lengths[0].association_id : "",
      rawText: "",
      sourceAssociationId: "",
    },
    width: {
      kind: widths.length === 1 ? "evidence" : "missing",
      associationId: widths.length === 1 ? widths[0].association_id : "",
      rawText: "",
      sourceAssociationId: "",
    },
  };
}

function reconcileCompletedReview(
  extracted: V2ExtractionResult,
  review: V2RoomReviewSelection,
): V2RoomReviewSelection {
  const reconcileAxis = (axis: "length" | "width", selection: V2RoomReviewSelection[typeof axis]) => {
    if (selection.kind !== "evidence" || !review.sourceRoomId) return selection;
    if (isEligibleV2Association(extracted, review.sourceRoomId, axis, selection.associationId)) return selection;
    const association = extracted.associations.find((item) => item.association_id === selection.associationId);
    const rawText = association
      ? extracted.dimensions.find((item) => item.dimension_id === association.dimension_id)?.raw_text?.trim()
      : "";
    return rawText
      ? { kind: "human_correction" as const, associationId: "", rawText, sourceAssociationId: selection.associationId }
      : { kind: "missing" as const, associationId: "", rawText: "", sourceAssociationId: "" };
  };
  return {
    ...review,
    decision: review.decision === "accepted" && !review.name.trim() ? "pending" : review.decision,
    length: reconcileAxis("length", review.length),
    width: reconcileAxis("width", review.width),
  };
}

function readPersistedV2Job(): PersistedV2Job | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ownedStorageKey(V2_JOB_STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedV2Job>;
    if (parsed.ownerUid !== (auth.currentUser?.uid ?? null)) return null;
    if (!parsed.jobId || !parsed.backendUrl || !parsed.fileName) return null;
    if (parsed.pipeline !== "v24-luna" && parsed.pipeline !== "v25-luna" && parsed.pipeline !== "v26-luna" && parsed.pipeline !== "v27-luna" && parsed.pipeline !== "v28-luna" && parsed.pipeline !== "v29-luna" && parsed.pipeline !== "v210-luna") {
      parsed.pipeline = "v24-luna";
    }
    return {
      ...parsed,
      version: 3,
      statusUrl: parsed.statusUrl ?? `/api/experimental/v2/plans/jobs/${encodeURIComponent(parsed.jobId)}`,
    } as PersistedV2Job;
  } catch {
    return null;
  }
}

function writePersistedV2Job(job: PersistedV2Job) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ownedStorageKey(V2_JOB_STORAGE_KEY), JSON.stringify(job));
}

function clearPersistedV2Job() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ownedStorageKey(V2_JOB_STORAGE_KEY));
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

// Plain-language progress copy for the pipeline's internal stage names, shown to
// regular users. Falls back to a humanized version of the raw stage for anything
// not mapped here (e.g. future stages), so progress never looks broken.
const FRIENDLY_STAGE_LABELS: Record<string, string> = {
  queued: "Preparing your scan",
  opening_document: "Opening your PDF",
  rendering_page_overview: "Preparing page previews",
  locating_plan_views: "Finding the floor plan on each page",
  generating_native_ocr_candidates: "Scanning for room labels and dimensions",
  reading_source_regions: "Analyzing floor plan layout",
  regional_extraction_complete: "Reviewing detected rooms",
  deterministic_reconciliation_complete: "Cross-checking room details",
  verification_complete: "Verifying room dimensions",
  safety_adjudication_complete: "Double-checking uncertain rooms",
  review_evidence_rendered: "Preparing room images for review",
  recovering_after_restart: "Reconnecting to your scan",
  complete: "Finishing up",
};

function friendlyStageLabel(stage: string): string {
  return FRIENDLY_STAGE_LABELS[stage] ?? stageLabel(stage);
}

function warningLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

// A room only counts as "clearly detected" when its name and both dimensions were
// resolved without ambiguity and it isn't flagged for an inclusion decision - everything
// else needs a human look before it can be trusted.
function isClearlyDetectedRoom(review: V2RoomReviewSelection, sourceRoom: V2RoomInstance | null): boolean {
  if (!sourceRoom || sourceRoom.import_eligibility === "requires_review") return false;
  if (!review.name.trim()) return false;
  const lengthReady = review.length.kind === "evidence" && Boolean(review.length.associationId);
  const widthReady = review.width.kind === "evidence" && Boolean(review.width.associationId);
  return lengthReady && widthReady;
}

type HvacBucket = "conditioned" | "auxiliary" | "nonHvac";

// Groups the backend's deterministic space_category (plan-evidence/2.0 contract) into the
// three HVAC-relevant triage buckets, so unconditioned structural/exterior noise (crawl
// spaces, mechanical rooms, porches) and quick-triage storage/circulation spaces stop
// competing for attention with real conditioned rooms in the main review workbench.
function hvacBucketFor(sourceRoom: V2RoomInstance | null): HvacBucket {
  switch (sourceRoom?.space_category) {
    case "storage":
    case "circulation":
      return "auxiliary";
    case "service":
    case "exterior":
    case "annotation":
      return "nonHvac";
    default:
      return "conditioned";
  }
}

function downloadJson(result: V2ExtractionResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.document.filename.replace(/\.pdf$/i, "") || "plan"}-v2-evidence.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadReviewedImport(prepared: PreparedV2ReviewedImport) {
  const payload = {
    review: prepared.review,
    converted_rooms: prepared.convertedRooms.map((room) => ({
      source_room_id: room.sourceRoomId,
      page_number: room.pageNumber,
      room_input: room.roomInput,
      selected_length: room.selectedLength,
      selected_width: room.selectedWidth,
      validation: room.validation,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${prepared.fileName.replace(/\.pdf$/i, "") || "plan"}-v2-reviewed-import.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatCost(result: V2ExtractionResult): string {
  const costs = result.run.provider_usage.map((entry) => entry.estimated_cost_usd);
  if (costs.some((cost) => cost === null)) return "Unavailable";
  return `$${costs.reduce((sum, cost) => sum + (cost ?? 0), 0).toFixed(4)}`;
}

export default function ExperimentalV2Panel({
  file,
  pageCount,
  backendUrl,
  isCreatingProject,
  onCreateDraftProject,
  debugMode = false,
  knownRegion,
}: ExperimentalV2PanelProps) {
  const [restoredSession] = useState<PersistedV2Session | null>(readPersistedV2Session);
  const [restoredJob] = useState<PersistedV2Job | null>(readPersistedV2Job);
  const [activeJob, setActiveJob] = useState<PersistedV2Job | null>(restoredJob);
  const [status, setStatus] = useState<RunStatus>(restoredJob ? "running" : restoredSession ? "complete" : "idle");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [pollResumeGeneration, setPollResumeGeneration] = useState(0);
  // Default to scanning every page in one run - a multi-page plan scanned page-by-page
  // produces a separate project per page with no way to merge them back together.
  const [scope, setScope] = useState<PageScope>("all");
  const [pipeline, setPipeline] = useState<ExperimentalV2Pipeline>(
    restoredSession?.pipeline ?? restoredJob?.pipeline ?? "v25-luna",
  );
  const [pageNumber, setPageNumber] = useState(1);
  const [includeNativeTextHints, setIncludeNativeTextHints] = useState(true);
  const [result, setResult] = useState<V2ExtractionResult | null>(restoredSession?.result ?? null);
  const [error, setError] = useState<string | null>(null);
  const [roomReviews, setRoomReviews] = useState<Record<string, V2RoomReviewSelection>>(
    restoredSession?.roomReviews ?? restoredJob?.roomReviews ?? {},
  );
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState({ stage: "queued", progress: 0 });
  // The summary remains useful before the first crop batch. Once review_result
  // arrives, it drives the same editable workbench used by the completed run.
  const [partialSnapshot, setPartialSnapshot] = useState<V2PartialEvidenceSnapshot | null>(null);
  const [incrementalResult, setIncrementalResult] = useState<V2ExtractionResult | null>(null);
  const [projectMetadataDraft, setProjectMetadataDraft] = useState<ProjectMetadataDraft>(
    restoredSession?.projectMetadataDraft ?? restoredJob?.projectMetadataDraft ?? EMPTY_PROJECT_METADATA_DRAFT,
  );
  const [touchedProjectMetadataFields, setTouchedProjectMetadataFields] = useState<Set<keyof ProjectMetadataDraft>>(
    new Set(),
  );
  const [reviewSessionId, setReviewSessionId] = useState(
    restoredSession?.reviewSessionId ?? restoredJob?.reviewSessionId ?? newReviewSessionId,
  );
  const [reviewStartedAt, setReviewStartedAt] = useState(
    restoredSession?.reviewStartedAt ?? restoredJob?.reviewStartedAt ?? new Date().toISOString(),
  );
  const [correctionKeys, setCorrectionKeys] = useState<string[]>(
    restoredSession?.correctionKeys ?? restoredJob?.correctionKeys ?? [],
  );
  const [reviewCompletedMetricSent, setReviewCompletedMetricSent] = useState(
    restoredSession?.reviewCompletedMetricSent ?? false,
  );
  const cancellationInFlight = useRef(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [reviewSyncEnabled, setReviewSyncEnabled] = useState(false);
  const [reloadReview, setReloadReview] = useState(0);
  const [reviewSaveStatus, setReviewSaveStatus] = useState("");
  const [attentionOverrideIds, setAttentionOverrideIds] = useState<Set<string>>(new Set());
  // Rooms the reviewer explicitly asked to see in the main conditioned workbench despite
  // their auto-detected HVAC bucket (e.g. "Review in detail" on a storage/non-HVAC row).
  const [bucketOverrideIds, setBucketOverrideIds] = useState<Set<string>>(new Set());
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const reviewRevision = useRef(0);
  const reviewSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const activeReviewMs = useRef(restoredSession?.activeReviewMs ?? 0);
  const reviewGeneration = useRef(0);
  const reviewSyncPending = useRef(restoredSession?.reviewSyncPending ?? false);
  const sessionOwner = useRef(auth.currentUser?.uid ?? null);

  useEffect(() => auth.onAuthStateChanged((user) => {
    if ((user?.uid ?? null) === sessionOwner.current) return;
    sessionOwner.current = user?.uid ?? null;
    reviewGeneration.current += 1;
    setActiveJob(null);
    setResult(null);
    setIncrementalResult(null);
    setRoomReviews({});
    setStatus("idle");
    setReviewSyncEnabled(false);
  }), []);

  useEffect(() => {
    const token = result?.run.artifact_access_token;
    reviewGeneration.current += 1;
    setReviewReady(false);
    setReviewSyncEnabled(false);
    reviewRevision.current = 0;
    if (!token) { setReviewReady(true); return; }
    let cancelled = false;
    setReviewSaveStatus("Loading your saved progress...");
    // Drain any old request before reloading the same run's server revision.
    void reviewSaveQueue.current.then(() => getV2ReviewDraft(backendUrl, token)).then((saved) => {
      if (cancelled) return;
      const localPending = reloadReview === 0 && restoredSession?.result.run.run_id === result.run.run_id
        && restoredSession.reviewSyncPending;
      if (localPending && saved.revision !== (restoredSession.reviewRevision ?? 0)) {
        setReviewReady(true);
        setReviewSaveStatus("You have changes here that haven't been saved, and a newer version was saved elsewhere. Download your changes here before loading the newer version.");
        return;
      }
      reviewRevision.current = saved.revision;
      if (!localPending && saved.draft && saved.draft.run_id === result.run.run_id) {
        setRoomReviews(saved.draft.room_reviews);
        setReviewSessionId(saved.draft.review_session_id);
        setReviewStartedAt(saved.draft.review_started_at);
        setCorrectionKeys(saved.draft.correction_keys);
        activeReviewMs.current = saved.draft.active_review_ms;
        if (saved.draft.project_metadata_draft) {
          const restoredMetadata = saved.draft.project_metadata_draft;
          setProjectMetadataDraft(restoredMetadata);
          // Every restored field was an explicit prior human edit/confirmation -
          // never let a later-streaming page's extraction silently overwrite it.
          setTouchedProjectMetadataFields(
            (current) => new Set([...current, ...(Object.keys(restoredMetadata) as Array<keyof ProjectMetadataDraft>)]),
          );
        }
      }
      setReviewReady(true);
      setReviewSyncEnabled(true);
      setReviewSaveStatus("Your progress was restored. Changes save automatically.");
    }).catch(() => {
      if (!cancelled) {
        setReviewReady(true);
        setReviewSaveStatus("We couldn't restore your saved progress right now. You can keep working here, and download a backup copy of your changes at any time.");
      }
    });
    return () => { cancelled = true; };
  }, [backendUrl, result?.run.run_id, reloadReview, restoredSession]);

  useEffect(() => {
    if (!reviewReady) return;
    let lastInteraction = Date.now();
    let lastTick = Date.now();
    const activity = () => { lastInteraction = Date.now(); };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("scroll", activity, true);
    const interval = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible" && document.hasFocus() && now - lastInteraction < 30_000) {
        activeReviewMs.current += Math.min(1500, now - lastTick);
      }
      lastTick = now;
    }, 1000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("scroll", activity, true);
    };
  }, [reviewReady]);

  useEffect(() => {
    const token = result?.run.artifact_access_token;
    if (!result || !token || !reviewReady) return;
    reviewSyncPending.current = true;
    if (!reviewSyncEnabled) return;
    const generation = reviewGeneration.current;
    let cancelled = false;
    setReviewSaveStatus("Saving your progress...");
    const timer = window.setTimeout(() => {
      reviewSaveQueue.current = reviewSaveQueue.current.then(async () => {
        if (cancelled || generation !== reviewGeneration.current) return;
        try {
          const saved = await saveV2ReviewDraft(backendUrl, token, reviewRevision.current, {
            schema_version: "plan-review-session/1.0", run_id: result.run.run_id,
            room_reviews: roomReviews, review_session_id: reviewSessionId, review_started_at: reviewStartedAt,
            correction_keys: correctionKeys, active_review_ms: Math.round(activeReviewMs.current),
            project_metadata_draft: projectMetadataDraft,
          });
          // Advance revision even if another edit queued during this request.
          if (generation !== reviewGeneration.current) return;
          reviewRevision.current = saved.revision;
          if (!cancelled) reviewSyncPending.current = false;
          if (!cancelled) setReviewSaveStatus("Progress saved.");
        } catch {
          if (generation !== reviewGeneration.current) return;
          setReviewSyncEnabled(false);
          setReviewSaveStatus("We couldn't save your progress just now. You can keep editing — download a backup of your changes before loading any saved version.");
        }
      });
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [backendUrl, result, reviewReady, reviewSyncEnabled, roomReviews, reviewSessionId, reviewStartedAt, correctionKeys, projectMetadataDraft]);

  useEffect(() => {
    if (!file) return;
    if (restoredJob?.fileFingerprint === fileFingerprint(file)) return;
    if (restoredSession?.fileFingerprint === fileFingerprint(file)) return;
    clearPersistedV2Session();
    clearPersistedV2Job();
    setActiveJob(null);
    setStatus("idle");
    setResult(null);
    setIncrementalResult(null);
    setError(null);
    setReviewActionError(null);
    setRoomReviews({});
    setJobProgress({ stage: "queued", progress: 0 });
    setCorrectionKeys([]);
    setReviewCompletedMetricSent(false);
    setPageNumber(1);
    // Also clear the previous file's partial snapshot - latestProjectMetadata
    // below falls back to partialSnapshot.project_metadata, so leaving it set
    // would silently re-seed the draft we're about to clear with stale data.
    setPartialSnapshot(null);
    // A replacement PDF must never inherit the previous file's address,
    // region, temperatures, heating system, etc. - reset both the draft
    // values and which fields the reviewer already touched, scoped to this
    // new file's identity (fileFingerprint), not just cleared once up front.
    setProjectMetadataDraft(EMPTY_PROJECT_METADATA_DRAFT);
    setTouchedProjectMetadataFields(new Set());
  }, [file, restoredJob, restoredSession]);

  useEffect(() => {
    if (!result || typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => {
      const session: PersistedV2Session = {
        version: 5,
        ownerUid: sessionOwner.current,
        savedAt: new Date().toISOString(),
        fileFingerprint: file ? fileFingerprint(file) : restoredSession?.fileFingerprint ?? null,
        pipeline,
        result,
        roomReviews,
        reviewSessionId,
        reviewStartedAt,
        correctionKeys,
        reviewCompletedMetricSent,
        reviewRevision: reviewRevision.current,
        reviewSyncPending: reviewSyncPending.current,
        activeReviewMs: activeReviewMs.current,
        projectMetadataDraft,
      };
      try {
        if (session.ownerUid !== (auth.currentUser?.uid ?? null)) return;
        window.sessionStorage.setItem(ownedStorageKey(V2_SESSION_STORAGE_KEY), JSON.stringify(session));
      } catch {
        setReviewSaveStatus("Your browser couldn't store a local backup right now. Keep this tab open until your progress is confirmed saved.");
      }
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [correctionKeys, file, pipeline, result, restoredSession, reviewCompletedMetricSent, reviewSessionId, reviewStartedAt, roomReviews, reviewSaveStatus, projectMetadataDraft]);

  // Mirror of the backup effect above, but for the "still running" phase:
  // incremental snapshots seed roomReviews (see activeWorkbenchResult below)
  // and the reviewer can start editing/accepting rooms and filling in the
  // metadata draft before the scan itself finishes - without this, those
  // edits only live in React state, so a page refresh mid-scan resumed the
  // same jobId's polling but silently lost every edit made so far.
  useEffect(() => {
    if (!activeJob || typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => {
      if (activeJob.ownerUid !== (auth.currentUser?.uid ?? null)) return;
      writePersistedV2Job({
        ...activeJob,
        roomReviews,
        projectMetadataDraft,
        correctionKeys,
        reviewSessionId,
        reviewStartedAt,
      });
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [activeJob, roomReviews, projectMetadataDraft, correctionKeys, reviewSessionId, reviewStartedAt]);


  const applyExtractionResult = useCallback((extracted: V2ExtractionResult) => {
    if (restoredSession?.result.run.run_id === extracted.run.run_id) {
      setStatus("complete");
      setError(null);
      return;
    }
    activeReviewMs.current = 0;
    const startedAt = new Date().toISOString();
    const sessionId = newReviewSessionId();
    setResult(extracted);
    setAttentionOverrideIds(new Set());
    setRoomReviews((current) => {
      // Cross-page reconciliation can merge/rename a room id that existed
      // while this job was still streaming (see reconciliation.py's
      // room_id_map, surfaced here as room_id_aliases) - without this, any
      // edit/decision made on that room's review while the job was RUNNING
      // would silently vanish the moment the final, reconciled result
      // arrives, since `current[room.room_id]` alone would no longer find it.
      const aliases = extracted.room_id_aliases ?? {};
      const oldIdsByFinalId = new Map<string, string[]>();
      for (const [oldId, finalId] of Object.entries(aliases)) {
        if (oldId === finalId) continue;
        const bucket = oldIdsByFinalId.get(finalId);
        if (bucket) bucket.push(oldId);
        else oldIdsByFinalId.set(finalId, [oldId]);
      }
      return Object.fromEntries(extracted.rooms.map((room) => {
        const migratedFrom = oldIdsByFinalId.get(room.room_id)?.map((oldId) => current[oldId]).find(Boolean);
        const existing = current[room.room_id] ?? migratedFrom;
        return [
          room.room_id,
          existing ? reconcileCompletedReview(extracted, existing) : buildRoomReview(extracted, room),
        ];
      }));
    });
    setIncrementalResult(null);
    setError(null);
    setStatus("complete");
    setReviewSessionId(sessionId);
    setReviewStartedAt(startedAt);
    setCorrectionKeys([]);
    setReviewCompletedMetricSent(false);
    const token = extracted.run.artifact_access_token;
    if (token) {
      void recordV2ReviewMetric(backendUrl, token, {
        run_id: extracted.run.run_id,
        session_id: sessionId,
        event: "review_started",
        elapsed_ms: 0,
        room_count: extracted.rooms.length,
        accepted_count: 0,
        excluded_count: 0,
        correction_count: 0,
      }).catch(() => {
        // Telemetry failure must never block evidence review.
      });
    }
  }, [backendUrl, restoredSession]);

  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    const pollingStartedAt = Date.now();
    setPollTimedOut(false);

    const poll = async () => {
      if (Date.now() - pollingStartedAt > POLL_MAX_DURATION_MS) {
        // The job may still be running server-side - we just stop polling
        // automatically forever rather than leaving the user staring at a
        // spinner with no way out. "Check again" below resumes polling.
        if (!cancelled) setPollTimedOut(true);
        return;
      }
      try {
        const job = await getLunaExtractionJob(activeJob.backendUrl, activeJob.jobId);
        if (cancelled) return;
        setJobProgress({ stage: job.stage, progress: job.progress });
        const snapshot = job.partial_snapshot ?? null;
        setPartialSnapshot(snapshot);
        if (snapshot?.review_result) {
          setIncrementalResult(snapshot.review_result);
          setRoomReviews((current) => {
            const next = { ...current };
            for (const room of snapshot.review_result!.rooms) {
              next[room.room_id] ??= buildRoomReview(snapshot.review_result!, room);
            }
            return next;
          });
        }
        if (job.status === "succeeded" && job.result) {
          setActiveJob(null);
          setPartialSnapshot(null);
          applyExtractionResult(job.result);
          return;
        }
        if (job.status === "failed") {
          clearPersistedV2Job();
          setActiveJob(null);
          setStatus("error");
          setError(job.error ?? "This scan couldn't be completed. Please try again.");
          return;
        }
        if (job.status === "cancelled") {
          clearPersistedV2Job();
          setActiveJob(null);
          setStatus("cancelled");
          setError(null);
          return;
        }
        setStatus("running");
        setError(null);
        timeoutId = window.setTimeout(() => void poll(), 2_000);
      } catch (pollError) {
        if (cancelled) return;
        const message = pollError instanceof Error
          ? pollError.message
          : "We couldn't check the status of this scan.";
        // errorFromResponse() always returns a generic, user-facing message
        // (never embeds the status code in the text), so checking .status
        // directly is required here - the previous message.includes("(404)")
        // check could never match anything and this branch never ran,
        // leaving an expired/already-gone job polling (and failing) forever.
        if (pollError instanceof ExperimentalV2Error && pollError.status === 404) {
          clearPersistedV2Job();
          setActiveJob(null);
          setStatus("error");
          setError("This scan has expired and can no longer be recovered. Please start a new one.");
          return;
        }
        setError(`${message} Retrying automatically...`);
        timeoutId = window.setTimeout(() => void poll(), 3_000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [activeJob, applyExtractionResult, pollResumeGeneration]);

  const warningGroups = useMemo(() => {
    const groups = new Map<string, { count: number; example: string }>();
    for (const warning of result?.warnings ?? []) {
      const current = groups.get(warning.code);
      groups.set(warning.code, current
        ? { ...current, count: current.count + 1 }
        : { count: 1, example: warning.message });
    }
    return [...groups.entries()].sort((left, right) => right[1].count - left[1].count);
  }, [result]);

  const runExtraction = async () => {
    if (!file) return;
    clearPersistedV2Session();
    clearPersistedV2Job();
    setActiveJob(null);
    setStatus("running");
    setError(null);
    setReviewActionError(null);
    setResult(null);
    setJobProgress({ stage: "queued", progress: 0 });
    setPartialSnapshot(null);
    setIncrementalResult(null);
    try {
      const extractionOptions = {
        ...(scope === "selected" ? { page_numbers: [pageNumber] } : {}),
        include_native_text_hints: includeNativeTextHints,
      };
      if (pipeline === "v24-luna" || pipeline === "v25-luna" || pipeline === "v26-luna" || pipeline === "v27-luna" || pipeline === "v28-luna" || pipeline === "v29-luna" || pipeline === "v210-luna") {
        const started = await startLunaExtractionJob(file, backendUrl, extractionOptions, pipeline);
        const persistedJob: PersistedV2Job = {
          version: 3,
          ownerUid: sessionOwner.current,
          jobId: started.job_id,
          backendUrl,
          fileName: file.name,
          fileFingerprint: fileFingerprint(file),
          startedAt: new Date().toISOString(),
          statusUrl: started.status_url,
          pipeline,
        };
        writePersistedV2Job(persistedJob);
        setActiveJob(persistedJob);
        return;
      }
      const extracted = await extractPlanRegionsV2(
        file,
        backendUrl,
        extractionOptions,
        pipeline,
      );
      applyExtractionResult(extracted);
    } catch (runError) {
      setStatus("error");
      setError(runError instanceof Error ? runError.message : "We couldn't complete the scan. Please try again.");
    }
  };

  const updateRoomReview = (roomId: string, patch: Partial<V2RoomReviewSelection>) => {
    setReviewActionError(null);
    const correctionFields = [
      "name" in patch ? `${roomId}:name` : null,
      "duplicateOfReviewRoomId" in patch ? `${roomId}:duplicate` : null,
      patch.decision === "excluded" ? `${roomId}:excluded` : null,
    ].filter((key): key is string => Boolean(key));
    if (correctionFields.length) {
      setCorrectionKeys((current) => [...new Set([...current, ...correctionFields])]);
    }
    setRoomReviews((current) => ({
      ...current,
      [roomId]: { ...current[roomId], ...patch },
    }));
  };

  const updateRoomAxis = (
    roomId: string,
    axis: "length" | "width",
    patch: Partial<V2RoomReviewSelection["length"]>,
  ) => {
    setReviewActionError(null);
    setCorrectionKeys((current) => [...new Set([...current, `${roomId}:${axis}`])]);
    setRoomReviews((current) => ({
      ...current,
      [roomId]: {
        ...current[roomId],
        decision: "pending",
        [axis]: { ...current[roomId][axis], ...patch },
      },
    }));
  };

  const addRoomReview = () => {
    const reviewRoomId = `human-room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setRoomReviews((current) => ({
      ...current,
      [reviewRoomId]: {
        reviewRoomId,
        sourceRoomId: null,
        sourcePageNumber: result?.pages[0]?.source_page_number ?? 1,
        decision: "pending",
        name: "",
        duplicateOfReviewRoomId: "",
        length: { kind: "missing", associationId: "", rawText: "", sourceAssociationId: "" },
        width: { kind: "missing", associationId: "", rawText: "", sourceAssociationId: "" },
      },
    }));
    setCorrectionKeys((current) => [...new Set([...current, `${reviewRoomId}:added`])]);
  };

  const acceptedRoomCount = Object.values(roomReviews).filter((review) => review.decision === "accepted").length;
  const excludedRoomCount = Object.values(roomReviews).filter((review) => review.decision === "excluded").length;

  const roomById = useMemo(
    () => new Map((result?.rooms ?? []).map((room) => [room.room_id, room])),
    [result],
  );

  // The single long-lived review workbench below reads from whichever
  // result is currently authoritative - the final reconciled `result` once
  // the job completes, or the still-streaming `incrementalResult` while it's
  // running - instead of two separate workbench mounts (one per status),
  // which used to unmount+remount the component across that transition and
  // lose its zoom/pan, active room selection and undo history.
  const activeWorkbenchResult = result ?? incrementalResult;
  const activeWorkbenchRoomById = result
    ? roomById
    : new Map((incrementalResult?.rooms ?? []).map((room) => [room.room_id, room]));

  // Project metadata streams independently of room batches - prefer the most
  // authoritative source available (final result > in-progress review graph
  // > lightweight partial snapshot).
  const latestProjectMetadata: V2ProjectMetadataExtraction | null =
    result?.project_metadata ?? incrementalResult?.project_metadata ?? partialSnapshot?.project_metadata ?? null;

  const effectiveRegion: Region | undefined = knownRegion ?? (projectMetadataDraft.region || undefined);

  useEffect(() => {
    setProjectMetadataDraft((current) =>
      seedProjectMetadataDraft(current, touchedProjectMetadataFields, latestProjectMetadata),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestProjectMetadata]);

  const updateProjectMetadataDraft = (patch: Partial<ProjectMetadataDraft>) => {
    setProjectMetadataDraft((current) => ({ ...current, ...patch }));
    setTouchedProjectMetadataFields((current) => new Set([...current, ...(Object.keys(patch) as Array<keyof ProjectMetadataDraft>)]));
  };

  const {
    attentionReviews,
    conditionedAttention,
    auxiliaryAttention,
    nonHvacAttention,
    readyReviews,
    decidedReviews,
  } = useMemo(() => {
    const attention: V2RoomReviewSelection[] = [];
    const conditioned: V2RoomReviewSelection[] = [];
    const auxiliary: V2RoomReviewSelection[] = [];
    const nonHvac: V2RoomReviewSelection[] = [];
    const ready: V2RoomReviewSelection[] = [];
    const decided: V2RoomReviewSelection[] = [];
    for (const review of Object.values(roomReviews)) {
      if (review.decision !== "pending") {
        decided.push(review);
        continue;
      }
      const sourceRoom = review.sourceRoomId ? roomById.get(review.sourceRoomId) ?? null : null;
      if (!attentionOverrideIds.has(review.reviewRoomId) && isClearlyDetectedRoom(review, sourceRoom)) {
        ready.push(review);
        continue;
      }
      attention.push(review);
      const bucket = bucketOverrideIds.has(review.reviewRoomId) ? "conditioned" : hvacBucketFor(sourceRoom);
      if (bucket === "auxiliary") auxiliary.push(review);
      else if (bucket === "nonHvac") nonHvac.push(review);
      else conditioned.push(review);
    }
    return {
      attentionReviews: attention,
      conditionedAttention: conditioned,
      auxiliaryAttention: auxiliary,
      nonHvacAttention: nonHvac,
      readyReviews: ready,
      decidedReviews: decided,
    };
  }, [roomReviews, roomById, attentionOverrideIds, bucketOverrideIds]);

  // Shared bulk action for the auxiliary/non-HVAC drawers - excludes every room currently
  // in that bucket in one click instead of 15-25 separate clicks.
  const excludeAll = (reviews: V2RoomReviewSelection[]) => {
    if (reviews.length === 0) return;
    setReviewActionError(null);
    setRoomReviews((current) => {
      const next = { ...current };
      for (const review of reviews) {
        next[review.reviewRoomId] = { ...current[review.reviewRoomId], decision: "excluded" };
      }
      return next;
    });
  };

  const acceptAllReady = () => {
    if (readyReviews.length === 0) return;
    setReviewActionError(null);
    setRoomReviews((current) => {
      const next = { ...current };
      for (const review of readyReviews) {
        next[review.reviewRoomId] = { ...current[review.reviewRoomId], decision: "accepted" };
      }
      return next;
    });
  };

  const prepareReviewedImport = async (): Promise<PreparedV2ReviewedImport> => {
    if (!result) throw new Error("Run a scan before preparing your review.");
    const token = result.run.artifact_access_token;
    if (!token) throw new Error("This result can no longer be validated. Please run the scan again.");
    // Also normalize restored/HMR-preserved drafts created before the
    // workbench distinguished eligible evidence from nearby suggestions.
    const reconciledReviews = Object.fromEntries(
      Object.entries(roomReviews).map(([roomId, review]) => [
        roomId, reconcileCompletedReview(result, review),
      ]),
    );
    setRoomReviews(reconciledReviews);
    const validation = await validateV2Review(
      backendUrl,
      token,
      result.run.run_id,
      buildV2ReviewDraftRooms(reconciledReviews),
    );
    return prepareV2ReviewedImport(result, validation, reconciledReviews);
  };

  const reportReviewCompleted = async () => {
    if (!result || reviewCompletedMetricSent) return;
    const token = result.run.artifact_access_token;
    if (!token) return;
    const reviews = Object.values(roomReviews);
    try {
      await recordV2ReviewMetric(backendUrl, token, {
        run_id: result.run.run_id,
        session_id: reviewSessionId,
        event: "review_completed",
        elapsed_ms: Math.max(0, Date.now() - Date.parse(reviewStartedAt)),
        active_review_ms: Math.round(activeReviewMs.current),
        room_count: reviews.length,
        accepted_count: reviews.filter((review) => review.decision === "accepted").length,
        excluded_count: reviews.filter((review) => review.decision === "excluded").length,
        correction_count: correctionKeys.length,
      });
      setReviewCompletedMetricSent(true);
    } catch {
      // Product actions remain available if telemetry is temporarily unavailable.
    }
  };

  const handleDownloadReview = async () => {
    setReviewActionError(null);
    try {
      const prepared = await prepareReviewedImport();
      downloadReviewedImport(prepared);
      await reportReviewCompleted();
    } catch (reviewError) {
      setReviewActionError(reviewError instanceof Error ? reviewError.message : "We couldn't prepare your review for download. Please try again.");
    }
  };

  const handleCreateDraftProject = async () => {
    setReviewActionError(null);
    try {
      const prepared = await prepareReviewedImport();
      if (prepared.convertedRooms.length === 0) {
        throw new Error("Accept at least one reviewed room before creating a project.");
      }
      await onCreateDraftProject(prepared, projectMetadataDraft);
      await reportReviewCompleted();
    } catch (reviewError) {
      setReviewActionError(reviewError instanceof Error ? reviewError.message : "We couldn't create a project from this review. Please try again.");
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob || cancellationInFlight.current) return;
    cancellationInFlight.current = true;
    setError(null);
    try {
      const cancelledJob = await cancelLunaExtractionJob(activeJob.backendUrl, activeJob.jobId);
      setJobProgress({ stage: cancelledJob.stage, progress: cancelledJob.progress });
      clearPersistedV2Job();
      setActiveJob(null);
      setStatus("cancelled");
    } catch (cancelError) {
      // A 404 here means the job is already gone server-side (expired or
      // otherwise unrecoverable) - from the user's perspective there's
      // nothing left to stop, so "Cancel & go back" must still take them
      // back to the upload view instead of silently failing and leaving
      // them stuck on the in-progress screen with no way out.
      if (cancelError instanceof ExperimentalV2Error && cancelError.status === 404) {
        clearPersistedV2Job();
        setActiveJob(null);
        setStatus("cancelled");
        return;
      }
      setError(cancelError instanceof Error ? cancelError.message : "We couldn't cancel the scan. Please try again.");
    } finally {
      cancellationInFlight.current = false;
    }
  };

  // Clears any in-progress or completed scan and returns to the upload/configuration
  // view, without touching the selected file (it lives in the parent page).
  const resetToUpload = () => {
    clearPersistedV2Session();
    clearPersistedV2Job();
    setActiveJob(null);
    setStatus("idle");
    setResult(null);
    setError(null);
    setReviewActionError(null);
    setRoomReviews({});
    setJobProgress({ stage: "queued", progress: 0 });
    setCorrectionKeys([]);
    setReviewCompletedMetricSent(false);
    setAttentionOverrideIds(new Set());
    setPartialSnapshot(null);
    setIncrementalResult(null);
  };

  const hasUnsavedReviewProgress = acceptedRoomCount > 0 || excludedRoomCount > 0 || correctionKeys.length > 0;

  const handleBackToUpload = () => {
    if (hasUnsavedReviewProgress) {
      setShowBackConfirm(true);
      return;
    }
    resetToUpload();
  };

  if (!file && !result && !activeJob) return null;

  return (
    <section className="mt-5 rounded-xl border border-violet-300 bg-violet-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 font-semibold text-violet-950">
            <ScanLine size={18} aria-hidden="true" />
            Automatic room detection
          </h2>
          <p className="mt-1 text-sm text-violet-900">
            We'll scan your uploaded PDF to find rooms and dimensions automatically.
            You'll review every detected room before anything is added to your project.
          </p>
          {debugMode && (
            <p className="mt-2 text-xs text-amber-800">
              {pipeline === "v210-luna"
                ? "Our most refined detection option, with extra checks for ambiguous rooms and duplicate detections. "
                : pipeline === "v29-luna"
                ? "Adds extra checks for duplicate rooms, with a small trade-off in overall accuracy. "
                : pipeline === "v28-luna"
                ? "Thorough verification, though testing showed it can be slightly less accurate than the recommended option. "
                : pipeline === "v27-luna"
                ? "Includes an extra recovery step for incomplete rooms, though testing showed lower dimension accuracy. "
                : pipeline === "v26-luna"
                ? "A faster option that stops early on uncertain rooms, which can mean missing some rooms. "
                : pipeline === "v25-luna"
                ? "Recommended — balances accuracy and reliability for most floor plans. "
                : pipeline === "v24-luna"
                  ? "An earlier detection option, kept available for comparison. "
                  : "The original detection option. "}
              Results stay separate from your project until you review and accept the detected rooms.
            </p>
          )}
        </div>
        {file ? (
          <button
            type="button"
            onClick={() => void runExtraction()}
            disabled={status === "running"}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "running" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <ScanLine size={17} aria-hidden="true" />}
            {status === "running" ? "Scanning floor plan..." : "Scan floor plan"}
          </button>
        ) : null}
      </div>

      {!file && result ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          Recovered your previous scan results and room review progress after the page reloaded.
        </p>
      ) : null}

      {!file && activeJob ? (
        <p className="mt-4 rounded-lg border border-violet-200 bg-white p-3 text-sm text-violet-900" role="status">
          Reconnected to your in-progress scan for <strong>{activeJob.fileName}</strong>. It's still working —
          this page will show the results automatically when it's done.
        </p>
      ) : null}

      {file ? <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-700">
        {debugMode && (
          <label className="flex items-center gap-2 font-medium">
            Pipeline
            <select
              value={pipeline}
              onChange={(event) => {
                clearPersistedV2Session();
                clearPersistedV2Job();
                setActiveJob(null);
                setPipeline(event.target.value as ExperimentalV2Pipeline);
                setStatus("idle");
                setResult(null);
                setError(null);
                setRoomReviews({});
              }}
              disabled={status === "running"}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 font-normal"
            >
              <option value="v25-luna">V2.5 (recommended)</option>
              <option value="v210-luna">V2.10 (enhanced safety checks)</option>
              <option value="v29-luna">V2.9 (extra safety checks)</option>
              <option value="v28-luna">V2.8 (thorough verification)</option>
              <option value="v27-luna">V2.7 (extra recovery step)</option>
              <option value="v26-luna">V2.6 (faster, stops early)</option>
              <option value="v24-luna">V2.4 (earlier version)</option>
              <option value="v2-gemini">V2 (original version)</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 font-medium">
          Scope
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as PageScope)}
            disabled={status === "running"}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 font-normal"
          >
            <option value="selected">One page</option>
            <option value="all">All pages</option>
          </select>
        </label>
        {scope === "selected" && (
          <label className="flex items-center gap-2 font-medium">
            Page
            <select
              value={pageNumber}
              onChange={(event) => setPageNumber(Number(event.target.value))}
              disabled={status === "running"}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 font-normal"
            >
              {Array.from({ length: pageCount ?? 1 }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1}</option>
              ))}
            </select>
          </label>
        )}
        {debugMode && (
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={includeNativeTextHints}
              onChange={(event) => setIncludeNativeTextHints(event.target.checked)}
              disabled={status === "running"}
              className="h-4 w-4 rounded border-slate-300"
            />
            Include native PDF text hints
          </label>
        )}
      </div> : null}

      {scope === "selected" && (pageCount ?? 1) > 1 && (
        <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Scanning page {pageNumber} of {pageCount}. Rooms on other pages won't be included, and each scan
          creates a separate project. Choose "All pages" above to import the whole document at once.
        </p>
      )}

      {status === "running" && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-sm text-violet-900" role="status">
          <div className="flex items-center justify-between gap-3">
            <span><strong>{debugMode ? stageLabel(jobProgress.stage) : friendlyStageLabel(jobProgress.stage)}</strong> · {Math.round(jobProgress.progress * 100)}%</span>
            {activeJob ? (
              <button
                type="button"
                onClick={() => void handleCancelJob()}
                className="inline-flex items-center gap-1.5 rounded border border-violet-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-violet-50"
              >
                <Square size={12} fill="currentColor" aria-hidden="true" /> Cancel &amp; go back
              </button>
            ) : null}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100" aria-hidden="true">
            <div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${Math.max(2, jobProgress.progress * 100)}%` }} />
          </div>
          {partialSnapshot && partialSnapshot.rooms.length > 0 && !incrementalResult ? (
            <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-2.5">
              <p className="text-xs font-semibold text-violet-900">
                Rooms found so far ({partialSnapshot.rooms.length})
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Rooms found so far">
                {partialSnapshot.rooms.map((room) => (
                  <li
                    key={room.room_id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        room.verification_state === "machine_supported" ? "bg-emerald-500"
                        : room.verification_state === "machine_conflicted" ? "bg-red-500"
                        : "bg-amber-400"
                      }`}
                      aria-hidden="true"
                    />
                    {room.label_text?.trim() || "Unnamed room"}
                  </li>
                ))}
                {/* More rooms may still be found - a bounded, honest "still working" cue,
                    not a precise remaining count (the total isn't known until the scan finishes). */}
                <li className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-violet-100" aria-hidden="true" />
                <li className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-violet-100" aria-hidden="true" />
              </ul>
              <p className="mt-2 text-[11px] text-violet-700">Preparing the first interactive review batch...</p>
            </div>
          ) : null}
          {pollTimedOut ? (
            <div role="alert" className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <p>
                This is taking longer than expected. Your scan may still be running - we've just stopped
                checking automatically.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPollResumeGeneration((value) => value + 1)}
                  className="rounded border border-amber-400 bg-white px-2 py-1 font-semibold hover:bg-amber-100"
                >
                  Check again
                </button>
                {activeJob ? (
                  <button
                    type="button"
                    onClick={() => void handleCancelJob()}
                    className="rounded border border-amber-400 bg-white px-2 py-1 font-semibold hover:bg-amber-100"
                  >
                    Stop waiting
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-violet-800">
              {pipeline !== "v2-gemini"
                ? "This scan keeps running even if you refresh the page, navigate away, or briefly lose connection."
                : "Processing time can vary."}
            </p>
          )}
        </div>
      )}

      {(status === "running" || status === "complete") && (
        <ProjectMetadataReviewCard
          metadata={latestProjectMetadata}
          draft={projectMetadataDraft}
          status={status === "complete" ? "complete" : "running"}
          onChange={updateProjectMetadataDraft}
        />
      )}

      {activeWorkbenchResult && (
        <div className="mt-4">
          {result && conditionedAttention.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-slate-900">Needs your attention</h4>
              <p className="mt-1 text-xs text-slate-500">
                Missing a clear measurement, flagged for a decision, or added manually - review each one, then confirm, skip, or exclude it.
              </p>
            </>
          )}
          <div className="mt-3">
            <RoomReviewWorkbench
              result={activeWorkbenchResult}
              reviews={result ? conditionedAttention : Object.values(roomReviews)}
              allReviews={Object.values(roomReviews)}
              roomById={activeWorkbenchRoomById}
              backendUrl={backendUrl}
              status={result ? "complete" : "running"}
              loadedRoomCount={result ? conditionedAttention.length : activeWorkbenchResult.rooms.length}
              isCreatingProject={isCreatingProject}
              update={updateRoomReview}
              updateAxis={updateRoomAxis}
              onCreateProject={result ? undefined : () => void handleCreateDraftProject()}
              debugMode={debugMode}
              region={effectiveRegion}
              roomIdAliases={result?.room_id_aliases}
            />
          </div>
        </div>
      )}

      {status === "cancelled" && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700" role="status">
          Scan cancelled. Adjust the options above and scan again when you're ready.
        </p>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={handleBackToUpload}
                className="text-xs font-semibold text-violet-800 hover:underline"
              >
                ← Back to upload
              </button>
              <h3 className="mt-1 font-semibold text-slate-900">Scan results</h3>
              {debugMode && (
                <p className="mt-1 text-xs text-slate-500">
                  Reference: {result.run.run_id}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => downloadJson(result)}
              className="inline-flex items-center gap-2 rounded-md border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50"
            >
              <Download size={16} aria-hidden="true" />
              Download full details
            </button>
          </div>

          {showBackConfirm && (
            <ConfirmDialog
              title="Discard this review?"
              message={`You have ${acceptedRoomCount} accepted room${acceptedRoomCount === 1 ? "" : "s"} that ${acceptedRoomCount === 1 ? "hasn't" : "haven't"} been saved to a project yet. Going back to upload will discard this review.`}
              confirmText="Discard and go back"
              cancelText="Keep reviewing"
              onConfirm={() => { setShowBackConfirm(false); resetToUpload(); }}
              onCancel={() => setShowBackConfirm(false)}
            />
          )}

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Pages scanned</dt><dd className="mt-1 font-medium">{result.pages.length}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Rooms detected</dt><dd className="mt-1 font-medium">{result.rooms.length}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Needs review</dt><dd className="mt-1 font-medium">{attentionReviews.length}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Accepted</dt><dd className="mt-1 font-medium">{acceptedRoomCount}</dd></div>
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">Excluded</dt><dd className="mt-1 font-medium">{excludedRoomCount}</dd></div>
          </dl>
          {debugMode && (
            <p className="mt-2 text-xs text-slate-500">
              Dimensions found: {result.dimensions.filter((dimension) => dimension.origin === "printed").length} ·
              Time taken: {result.run.processing_time_seconds?.toFixed(1) ?? "?"}s · Estimated cost: {formatCost(result)}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-slate-600">
              Check each room against the matching part of your plan. Choose the detected measurement, type in a
              correction, or leave it blank to fill in later in the room editor.
            </p>
            <button type="button" disabled={!reviewReady} onClick={addRoomReview} className="inline-flex items-center gap-2 rounded border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50">
              <Plus size={16} aria-hidden="true" /> Add missing room
            </button>
          </div>

          <p className="mt-3 text-sm text-slate-600" role="status">{reviewSaveStatus}</p>
          {reviewReady && !reviewSyncEnabled && <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" className="underline" onClick={async () => {
              const token = result.run.artifact_access_token;
              if (!token) return;
              const generation = reviewGeneration.current;
              try {
                await reviewSaveQueue.current;
                const saved = await getV2ReviewDraft(backendUrl, token);
                if (generation !== reviewGeneration.current) return;
                if (saved.revision !== reviewRevision.current) {
                  setReviewSaveStatus("A newer version was saved elsewhere. Download your changes here before loading it.");
                  return;
                }
                setReviewSyncEnabled(true);
              } catch {
                if (generation === reviewGeneration.current) setReviewSaveStatus("Still unable to reconnect. You can keep editing here and download your changes as a backup.");
              }
            }}>Reconnect and save my changes</button>
            <button type="button" className="underline" onClick={() => {
              const blob = new Blob([JSON.stringify({ schema_version: "plan-review-session/1.0", run_id: result.run.run_id,
                room_reviews: roomReviews, review_session_id: reviewSessionId, review_started_at: reviewStartedAt,
                correction_keys: correctionKeys, active_review_ms: Math.round(activeReviewMs.current),
                project_metadata_draft: projectMetadataDraft }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a"); anchor.href = url; anchor.download = "local-review-draft.json";
              anchor.click(); URL.revokeObjectURL(url);
            }}>Download a backup of my changes</button>
            <button type="button" className="underline" onClick={() => setReloadReview((value) => value + 1)}>Load the saved version (replaces changes made here)</button>
          </div>}
          {Object.values(roomReviews).length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No rooms were detected yet. Use "Add missing room" to add one yourself.</p>
          ) : (
            <fieldset disabled={!reviewReady} className="disabled:opacity-60">
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold" role="status">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">{attentionReviews.length} need your attention</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">{readyReviews.length} ready to confirm</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">{acceptedRoomCount} accepted</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">{excludedRoomCount} excluded</span>
              </div>

              {auxiliaryAttention.length > 0 && (
                <details open className="mt-5 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-blue-900">
                    Closets, storage &amp; hallways ({auxiliaryAttention.length})
                  </summary>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="max-w-xl text-xs text-blue-800">
                      Storage, circulation, and similar spaces detected on the plan - usually a quick confirm or
                      exclude, with no dimension hunting needed.
                    </p>
                    <button
                      type="button"
                      onClick={() => excludeAll(auxiliaryAttention)}
                      className="whitespace-nowrap rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                    >
                      Exclude all {auxiliaryAttention.length}
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {auxiliaryAttention.map((review) => (
                      <li key={review.reviewRoomId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm">
                        <div>
                          <p className="font-semibold text-slate-900">{review.name || "Unnamed room"}</p>
                          <p className="text-xs text-slate-500">
                            Length {axisDisplayValue(review.length, result) || "—"} · Width {axisDisplayValue(review.width, result) || "—"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          <button type="button" onClick={() => updateRoomReview(review.reviewRoomId, { decision: "accepted" })} className="rounded border border-emerald-300 px-2 py-1 text-emerald-800 hover:bg-emerald-50">Confirm</button>
                          <button type="button" onClick={() => updateRoomReview(review.reviewRoomId, { decision: "excluded" })} className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100">Exclude</button>
                          <button type="button" onClick={() => setBucketOverrideIds((current) => new Set(current).add(review.reviewRoomId))} className="text-violet-800 underline">Review in detail</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {nonHvacAttention.length > 0 && (
                <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    Filtered out by HVAC rules ({nonHvacAttention.length})
                  </summary>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="max-w-xl text-xs text-slate-600">
                      Structural, mechanical, and exterior spaces (crawl spaces, mechanical rooms, porches, decks) that
                      don't normally receive conditioned airflow. Restore any that should still be reviewed.
                    </p>
                    <button
                      type="button"
                      onClick={() => excludeAll(nonHvacAttention)}
                      className="whitespace-nowrap rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Exclude all {nonHvacAttention.length}
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {nonHvacAttention.map((review) => (
                      <li key={review.reviewRoomId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm opacity-90">
                        <div>
                          <p className="font-semibold text-slate-900">{review.name || "Unnamed room"}</p>
                          <p className="text-xs text-slate-500">
                            Length {axisDisplayValue(review.length, result) || "—"} · Width {axisDisplayValue(review.width, result) || "—"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          <button type="button" onClick={() => updateRoomReview(review.reviewRoomId, { decision: "accepted" })} className="rounded border border-emerald-300 px-2 py-1 text-emerald-800 hover:bg-emerald-50">Confirm</button>
                          <button type="button" onClick={() => updateRoomReview(review.reviewRoomId, { decision: "excluded" })} className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100">Exclude</button>
                          <button type="button" onClick={() => setBucketOverrideIds((current) => new Set(current).add(review.reviewRoomId))} className="text-violet-800 underline">Review in detail</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {readyReviews.length > 0 && (
                <div className="mt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Looks good - ready to confirm</h4>
                      <p className="mt-1 text-xs text-slate-500">Name and both measurements were detected without ambiguity.</p>
                    </div>
                    <button
                      type="button"
                      onClick={acceptAllReady}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Accept all {readyReviews.length}
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {readyReviews.map((review) => (
                      <ReadyRoomRow
                        key={review.reviewRoomId}
                        review={review}
                        result={result}
                        onAccept={() => updateRoomReview(review.reviewRoomId, { decision: "accepted" })}
                        onReviewInDetail={() => setAttentionOverrideIds((current) => new Set(current).add(review.reviewRoomId))}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {decidedReviews.length > 0 && (() => {
                const acceptedDecided = decidedReviews.filter((review) => review.decision === "accepted");
                const excludedDecided = decidedReviews.filter((review) => review.decision === "excluded");
                const reopen = (reviewRoomId: string) => updateRoomReview(reviewRoomId, { decision: "pending" });
                return (
                  <div className="mt-5 space-y-3">
                    {acceptedDecided.length > 0 && (
                      <details className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
                          Accepted rooms ({acceptedDecided.length})
                        </summary>
                        <ul className="mt-3 space-y-2">
                          {acceptedDecided.map((review) => (
                            <li key={review.reviewRoomId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
                              <div>
                                <p className="font-semibold text-slate-900">{review.name || "Unnamed room"}</p>
                                <p className="text-xs text-slate-500">
                                  Length {axisDisplayValue(review.length, result) || "—"} · Width {axisDisplayValue(review.width, result) || "—"}
                                </p>
                              </div>
                              <button type="button" onClick={() => reopen(review.reviewRoomId)} className="text-xs font-semibold text-violet-800 underline">
                                Reopen for review
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {excludedDecided.length > 0 && (
                      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                          Excluded rooms ({excludedDecided.length})
                        </summary>
                        <ul className="mt-3 space-y-2">
                          {excludedDecided.map((review) => (
                            <li key={review.reviewRoomId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm opacity-80">
                              <div>
                                <p className="font-semibold text-slate-900">{review.name || "Unnamed room"}</p>
                                <p className="text-xs text-slate-500">
                                  Length {axisDisplayValue(review.length, result) || "—"} · Width {axisDisplayValue(review.width, result) || "—"}
                                </p>
                              </div>
                              <button type="button" onClick={() => reopen(review.reviewRoomId)} className="text-xs font-semibold text-violet-800 underline">
                                Reopen for review
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })()}
            </fieldset>
          )}

          {Object.values(roomReviews).length > 0 && (
            <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-emerald-950">Review summary</h4>
                  <p className="mt-1 text-sm text-emerald-900">
                    {acceptedRoomCount} room{acceptedRoomCount === 1 ? "" : "s"} accepted. Rooms you haven't reviewed yet
                    or excluded won't be added to your project.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadReview()}
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-400 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <Download size={16} aria-hidden="true" />
                    Download review details
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateDraftProject()}
                    disabled={!reviewReady || acceptedRoomCount === 0 || isCreatingProject}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCreatingProject ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <FileCheck2 size={16} aria-hidden="true" />}
                    {isCreatingProject ? "Creating project..." : `Create project (${acceptedRoomCount} room${acceptedRoomCount === 1 ? "" : "s"})`}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-emerald-900">
                Your project keeps a record of this review for reference. Any remaining room details will start
                with default values — you can finish them in the room editor.
              </p>
              {reviewActionError && (
                <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                  {reviewActionError}
                </p>
              )}
            </div>
          )}

          {warningGroups.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Things to review</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warningGroups.map(([code, group]) => (
                  <li key={code}>
                    {warningLabel(code)}{group.count > 1 ? ` (${group.count})` : ""}: {group.example}
                    {group.count > 1 ? " This came up more than once; one example is shown here." : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
