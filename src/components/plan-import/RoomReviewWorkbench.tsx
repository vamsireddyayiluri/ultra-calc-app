import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  V2Box,
  V2ExtractionResult,
  V2RoomInstance,
} from "../../plan-import/api/experimentalV2Client";
import { useV2EvidenceImageUrl } from "../../hooks/useV2EvidenceImageUrl";
import type {
  V2AxisReviewSelection,
  V2RoomReviewSelection,
} from "../../plan-import/pipeline/convertV2ReviewToRoomInput";
import { evidenceImageId, imagePercentBox } from "./RoomEvidenceReviewCard";
import { isEligibleV2Association } from "../../plan-import/pipeline/v2Eligibility";
import type { Region } from "../../models/projectTypes";
import { toDisplayArea } from "../../utils/display";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
// How much margin to add around the active room + dimensions/openings focus
// box before fitting it to the viewport, and how much of the viewport that
// padded box should fill at the computed auto-zoom level.
const FOCUS_PADDING_RATIO = 0.2;
const FOCUS_FILL_RATIO = 0.75;

interface Props {
  result: V2ExtractionResult;
  reviews: V2RoomReviewSelection[];
  // All rooms regardless of bucket - lets the active room keep rendering with live edits
  // even after editing it reclassifies it into the "ready to confirm" bucket.
  allReviews: V2RoomReviewSelection[];
  roomById: Map<string, V2RoomInstance>;
  backendUrl: string;
  debugMode?: boolean;
  update: (roomId: string, patch: Partial<V2RoomReviewSelection>) => void;
  updateAxis: (roomId: string, axis: "length" | "width", patch: Partial<V2AxisReviewSelection>) => void;
  status?: "running" | "complete";
  loadedRoomCount?: number;
  isCreatingProject?: boolean;
  onCreateProject?: () => void;
  // Governs ft²/m² display for Phase B windows/doors pills - defaults to
  // metric (canonical storage unit) when the project's region isn't known yet
  // (e.g. during new-project plan import, before a region has been confirmed).
  region?: Region;
  // Maps a room id from BEFORE final cross-page reconciliation to the
  // surviving room id it was merged into (see reconciliation.py's
  // room_id_map, surfaced as V2ExtractionResult.room_id_aliases). Lets this
  // single long-lived workbench instance follow its active room/undo history
  // across the RUNNING -> COMPLETE transition instead of losing them when
  // reconciliation renames/merges the room it had open.
  roomIdAliases?: Record<string, string>;
}

interface DimensionCandidate {
  associationId: string;
  text: string;
}

function boxCenter(box: V2Box): { x: number; y: number } {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

function unionBoxes(boxes: Array<V2Box | null | undefined>): V2Box | null {
  return boxes.reduce<V2Box | null>((acc, box) => {
    if (!box) return acc;
    if (!acc) return box;
    return {
      x0: Math.min(acc.x0, box.x0),
      y0: Math.min(acc.y0, box.y0),
      x1: Math.max(acc.x1, box.x1),
      y1: Math.max(acc.y1, box.y1),
    };
  }, null);
}

// Grows a box outward from its own center by `ratio` (e.g. 0.2 == a ~20%
// padding margin on top of the box's own size) rather than shrinking it.
function padBox(box: V2Box, ratio: number): V2Box {
  const { x: cx, y: cy } = boxCenter(box);
  const halfWidth = ((box.x1 - box.x0) / 2) * (1 + ratio);
  const halfHeight = ((box.y1 - box.y0) / 2) * (1 + ratio);
  return { x0: cx - halfWidth, y0: cy - halfHeight, x1: cx + halfWidth, y1: cy + halfHeight };
}

function parsePercent(value: CSSProperties["left"]): number {
  return typeof value === "string" ? parseFloat(value) : typeof value === "number" ? value : 0;
}

// Shared pool of candidates for BOTH axes (not gated by the strict final-application
// eligibility check) - a room's own associations, deduped by displayed text and ranked
// by proximity to the room's own location, so a room with a valid nearby measurement
// never shows an empty suggestion list just because it hasn't been independently verified yet.
function rankedCandidates(result: V2ExtractionResult, room: V2RoomInstance): DimensionCandidate[] {
  const roomBox = room.location.pdf_points;
  const roomCenter = roomBox ? boxCenter(roomBox) : null;
  const dimensionById = new Map(result.dimensions.map((item) => [item.dimension_id, item]));
  const seenText = new Set<string>();
  const scored: Array<DimensionCandidate & { distance: number }> = [];
  for (const association of result.associations) {
    if (association.room_id !== room.room_id) continue;
    const dimension = dimensionById.get(association.dimension_id);
    const text = dimension?.raw_text?.trim();
    if (!dimension || !text || dimension.read_state === "unreadable" || seenText.has(text)) continue;
    seenText.add(text);
    const dimensionBox = dimension.location?.pdf_points;
    const distance = roomCenter && dimensionBox
      ? Math.hypot(boxCenter(dimensionBox).x - roomCenter.x, boxCenter(dimensionBox).y - roomCenter.y)
      : Number.MAX_SAFE_INTEGER;
    scored.push({ associationId: association.association_id, text, distance });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 6).map(({ associationId, text }) => ({ associationId, text }));
}

export function axisDisplayValue(axis: V2AxisReviewSelection, result: V2ExtractionResult): string {
  if (axis.kind === "human_correction") return axis.rawText;
  if (axis.kind === "evidence") {
    const association = result.associations.find((item) => item.association_id === axis.associationId);
    const dimension = association ? result.dimensions.find((item) => item.dimension_id === association.dimension_id) : null;
    return dimension?.raw_text ?? "";
  }
  return "";
}

function DimensionField({
  axis,
  label,
  value,
  candidates,
  result,
  sourceRoomId,
  onChange,
}: {
  axis: "length" | "width";
  label: string;
  value: V2AxisReviewSelection;
  candidates: DimensionCandidate[];
  result: V2ExtractionResult;
  sourceRoomId: string | null;
  onChange: (patch: Partial<V2AxisReviewSelection>) => void;
}) {
  const displayValue = axisDisplayValue(value, result);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</label>
        {value.kind === "missing" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
            Check value
          </span>
        )}
      </div>
      <input
        value={displayValue}
        onChange={(event) => onChange({ kind: "human_correction", rawText: event.target.value, associationId: "", sourceAssociationId: "" })}
        placeholder={`Select or type ${axis}`}
        aria-label={`${label} value`}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-900"
      />
      {candidates.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {candidates.map((candidate) => {
            const eligible = Boolean(
              sourceRoomId && isEligibleV2Association(result, sourceRoomId, axis, candidate.associationId),
            );
            const active = (
              value.kind === "evidence" && value.associationId === candidate.associationId
            ) || (
              value.kind === "human_correction" && value.sourceAssociationId === candidate.associationId
            );
            return (
              <button
                key={candidate.associationId}
                type="button"
                onClick={() => onChange(eligible
                  ? { kind: "evidence", associationId: candidate.associationId, rawText: "", sourceAssociationId: "" }
                  : { kind: "human_correction", associationId: "", rawText: candidate.text, sourceAssociationId: candidate.associationId }
                )}
                className={`min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold ${
                  active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {candidate.text}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500">No dimensions detected nearby — type the {axis} manually.</p>
      )}
    </div>
  );
}

// Master-detail "rapid review" workbench for the Needs-your-attention queue: one room
// at a time, blueprint on the left, simplified editable Length/Width on the right.
// Operates on the exact same roomReviews state / update(Axis) callbacks as the rest of
// the review flow - no changes to convertV2ReviewToRoomInput.ts or the backend contract.
export default function RoomReviewWorkbench({ result, reviews, allReviews, roomById, backendUrl, debugMode = false, update, updateAxis, status = "complete", loadedRoomCount = reviews.length, isCreatingProject = false, onCreateProject, region, roomIdAliases }: Props) {
  const [activeId, setActiveId] = useState<string | null>(reviews[0]?.reviewRoomId ?? null);
  const [zoom, setZoom] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const [undoStack, setUndoStack] = useState<Array<{ roomId: string; previous: V2RoomReviewSelection }>>([]);
  // "crop" (default) shows the widened, high-DPI per-room review-context
  // crop (razor-sharp dimension text) - "full" switches to the whole-sheet
  // overview (useful to check something further away than the crop's own
  // generous margin reaches). Both render the same green room-highlight +
  // Length/Width overlays, just projected against each image's own transforms.
  const [viewMode, setViewMode] = useState<"crop" | "full">("crop");
  // Tagged with the image_id it was measured from (not just {w, h}) so a room
  // switch that also changes imageId (a different sheet) can't briefly
  // compute a focus target by pairing the NEW image's percentage box against
  // the OLD image's pixel dimensions before its own onLoad has fired.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number; forImageId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Set by focusOnBox() right before a zoom change that needs a matching
  // scroll position once that new zoom has actually been committed to the
  // DOM (the scrollable content's scrollWidth/scrollHeight depend on the
  // CSS transform scale, so scrolling before it's painted would clamp
  // against the still-stale, previous zoom level's bounds).
  const pendingFocusRef = useRef<{ x: number; y: number; smooth: boolean } | null>(null);
  // Bumped on every focusOnBox() call, independent of whether the computed
  // zoom numerically changed (e.g. two different rooms can legitimately
  // need the same zoom level) - a same-value setZoom() would otherwise skip
  // the re-render the scroll-applying layout effect below depends on.
  const [focusVersion, setFocusVersion] = useState(0);

  const reviewById = useMemo(() => new Map(allReviews.map((item) => [item.reviewRoomId, item])), [allReviews]);

  // Picks the room right after `fromId` in the current queue order, wrapping to the
  // first remaining room - used so Confirm/Skip/Exclude advance predictably.
  const pickNextId = (fromId: string): string | null => {
    const position = reviews.findIndex((item) => item.reviewRoomId === fromId);
    const after = reviews.slice(position + 1).find((item) => item.reviewRoomId !== fromId);
    return (after ?? reviews.find((item) => item.reviewRoomId !== fromId))?.reviewRoomId ?? null;
  };

  // Keeps the active room selection pointed at a real review, migrating it across a
  // reconciled room-id alias first (so the same physical room the reviewer had open
  // stays open across the RUNNING -> COMPLETE transition, even though its id changed)
  // before falling back to resetting to the first review in the queue.
  useEffect(() => {
    if (activeId) {
      const migrated = roomIdAliases?.[activeId];
      if (migrated && migrated !== activeId && reviewById.has(migrated)) {
        setActiveId(migrated);
        return;
      }
      if (reviewById.has(activeId)) return;
    }
    setActiveId(reviews[0]?.reviewRoomId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, reviewById, roomIdAliases]);

  // Migrates the undo stack's room references the same way, so an in-progress
  // correction's undo entry still targets the right (now-reconciled) room.
  useEffect(() => {
    if (!roomIdAliases) return;
    setUndoStack((current) => current.map((entry) => {
      const migratedRoomId = roomIdAliases[entry.roomId] ?? entry.roomId;
      const migratedPrevious = roomIdAliases[entry.previous.reviewRoomId]
        ? { ...entry.previous, reviewRoomId: roomIdAliases[entry.previous.reviewRoomId] }
        : entry.previous;
      return migratedRoomId === entry.roomId && migratedPrevious === entry.previous
        ? entry
        : { roomId: migratedRoomId, previous: migratedPrevious };
    }));
  }, [roomIdAliases]);

  const review = (activeId ? reviewById.get(activeId) : null) ?? null;

  // If the active room got decided from somewhere else on the page (e.g. the separate
  // "ready to confirm" row's own Accept button), move on instead of continuing to edit it.
  useEffect(() => {
    if (review && review.decision !== "pending") {
      setActiveId(pickNextId(review.reviewRoomId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.decision]);

  const sourceRoom = review?.sourceRoomId ? roomById.get(review.sourceRoomId) ?? null : null;
  const overviewId = result.images.find((image) => image.page_id === sourceRoom?.page_id && image.role === "overview")?.image_id;
  const cropId = evidenceImageId(result, sourceRoom);
  // Default to the widened, high-DPI per-room crop (razor-sharp dimension
  // text - see review_context.py) - the "Full page" toggle below switches to
  // the whole-sheet overview when the reviewer needs to check something
  // beyond the crop's own generous margin. Each falls back to the other if
  // one wasn't rendered for this room/page.
  const imageId = (viewMode === "full" ? overviewId : cropId) ?? overviewId ?? cropId;
  const token = result.run.artifact_access_token;
  const { src: imageSrc, failed: imageFetchFailed, retry: retryImageFetch } = useV2EvidenceImageUrl(backendUrl, token, imageId);

  // Every new room starts in the crisp crop view, regardless of whatever
  // mode the reviewer last toggled to for the previous room.
  useEffect(() => {
    setViewMode("crop");
  }, [activeId]);

  // Scale that shows the whole crop within the viewer with no scrollbars - falls back to
  // 1 (natural size) until the image has loaded and its real pixel dimensions are known.
  const fitZoom = (natural: { w: number; h: number } | null): number => {
    const container = scrollRef.current;
    if (!natural || !container || natural.w <= 0 || natural.h <= 0) return 1;
    return Math.max(MIN_ZOOM, Math.min(container.clientWidth / natural.w, container.clientHeight / natural.h));
  };

  // Reset only on an actual image change (e.g. the active room moved to a
  // different sheet) - switching between rooms that share the same sheet's
  // overview image must NOT reset zoom/scroll here, since onLoad won't fire
  // again for an <img> whose src didn't change; see the activeId-keyed
  // focus effect below for that case instead.
  useEffect(() => {
    setNaturalSize(null);
    setImageFailed(false);
  }, [imageId]);

  const candidates = useMemo(() => (sourceRoom ? rankedCandidates(result, sourceRoom) : []), [result, sourceRoom]);

  // Phase B: windows/exterior-doors area joined from wall-tag marks + the
  // parsed Window/Door Schedule - present only when the backend found at
  // least one matched or detected-but-unmatched mark for this room.
  const envelope = useMemo(
    () => (sourceRoom ? result.room_envelope?.find((item) => item.room_id === sourceRoom.room_id) ?? null : null),
    [result, sourceRoom],
  );
  const areaUnitLabel = region === "US" || region === "CA_IMPERIAL" ? "ft²" : "m²";
  const formatArea = (valueM2: number) => {
    const displayValue = region ? toDisplayArea(region, valueM2) ?? valueM2 : valueM2;
    return `${displayValue.toFixed(1)} ${areaUnitLabel}`;
  };

  // Every box the overlay highlights for the active room's currently selected
  // length/width evidence - computed here (not after the early return below)
  // because the auto-focus effect further down needs it too, and all hooks
  // must run unconditionally on every render.
  const selectedBoxes = useMemo(() => {
    if (!review) return [];
    return (["length", "width"] as const)
      .map((axis) => {
        const selection = review[axis];
        if (selection.kind !== "evidence" || !selection.associationId) return null;
        const association = result.associations.find((item) => item.association_id === selection.associationId);
        const dimension = association ? result.dimensions.find((item) => item.dimension_id === association.dimension_id) : null;
        const box = dimension?.location?.pdf_points;
        if (!box || !imageId) return null;
        const style = imagePercentBox(result, imageId, box);
        return style ? { axis, box, style } : null;
      })
      .filter((item): item is { axis: "length" | "width"; box: V2Box; style: CSSProperties } => Boolean(item));
  }, [review, result, imageId]);

  // The rectangle "Fit to room" (and the auto-focus effect below) zoom/centre
  // onto: the backend's own review_crop_box (room + every linked dimension +
  // matched opening tags, already clamped to this room's view), unioned with
  // whatever the reviewer currently has selected for length/width (which can
  // point at a different candidate than what review_crop_box was built
  // from) so the focus box never excludes a box the reviewer is actively
  // looking at.
  const roomFocusBox = useMemo(() => {
    if (!sourceRoom) return null;
    return unionBoxes([
      sourceRoom.review_crop_box,
      sourceRoom.location.pdf_points,
      ...selectedBoxes.map((item) => item.box),
      ...(envelope?.openings ?? []).map((opening) => opening.tag_evidence?.box ?? null),
    ]);
  }, [sourceRoom, selectedBoxes, envelope]);

  // Computes the zoom level that fits `pdfBox` (padded) to ~75% of the
  // viewport and schedules a matching scroll - see pendingFocusRef's comment
  // above for why the scroll itself is deferred to a layout effect keyed on
  // focusVersion instead of being applied immediately here.
  const focusOnBox = (pdfBox: V2Box | null, natural: { w: number; h: number } | null, options: { smooth?: boolean } = {}) => {
    const container = scrollRef.current;
    if (!container) return;
    const style = pdfBox && natural && imageId ? imagePercentBox(result, imageId, padBox(pdfBox, FOCUS_PADDING_RATIO)) : null;
    const widthPx = style ? (parsePercent(style.width) / 100) * (natural?.w ?? 0) : 0;
    const heightPx = style ? (parsePercent(style.height) / 100) * (natural?.h ?? 0) : 0;
    if (!style || widthPx <= 0 || heightPx <= 0) {
      // No computable focus box (e.g. a manually-added room with no plan
      // evidence) - fall back to fitting the whole sheet, same as before.
      setZoom(fitZoom(natural));
      pendingFocusRef.current = { x: 0, y: 0, smooth: Boolean(options.smooth) };
      setFocusVersion((value) => value + 1);
      return;
    }
    const targetZoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min((container.clientWidth * FOCUS_FILL_RATIO) / widthPx, (container.clientHeight * FOCUS_FILL_RATIO) / heightPx),
      ),
    );
    const leftPx = (parsePercent(style.left) / 100) * (natural?.w ?? 0);
    const topPx = (parsePercent(style.top) / 100) * (natural?.h ?? 0);
    pendingFocusRef.current = {
      x: Math.max(0, (leftPx + widthPx / 2) * targetZoom - container.clientWidth / 2),
      y: Math.max(0, (topPx + heightPx / 2) * targetZoom - container.clientHeight / 2),
      smooth: Boolean(options.smooth),
    };
    setZoom(targetZoom);
    setFocusVersion((value) => value + 1);
  };

  // Applies the scroll position `focusOnBox` computed, once the zoom change
  // that drives it has actually been committed to the DOM - the scrollable
  // container's scroll bounds depend on the CSS transform scale, so scrolling
  // any earlier would clamp against the previous (stale) zoom's bounds. Keyed
  // on focusVersion (not zoom) so this still runs even when the newly
  // computed zoom happens to equal the previous value, which would otherwise
  // skip the re-render this effect needs.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    scrollRef.current?.scrollTo({ left: pending.x, top: pending.y, behavior: pending.smooth ? "smooth" : "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVersion]);

  // Auto-centre/auto-zoom onto the active room whenever it changes, or once
  // the (possibly page-shared) overview image's natural size first becomes
  // known - switching between rooms on the same sheet reuses the same <img>
  // without a fresh onLoad, so this can't rely on the image-load handler alone.
  useEffect(() => {
    if (!naturalSize || naturalSize.forImageId !== imageId) return;
    focusOnBox(roomFocusBox, naturalSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, naturalSize]);

  if (!review) return null;

  // Position within the reactive attention queue - falls back to 1 if the active room
  // briefly isn't in it (e.g. it just became "ready" while still being edited here).
  const queuePosition = reviews.findIndex((item) => item.reviewRoomId === review.reviewRoomId);
  const displayIndex = queuePosition >= 0 ? queuePosition + 1 : 1;

  const requiresInclusionReview = sourceRoom?.import_eligibility === "requires_review";

  const pushUndo = () => {
    setUndoStack((current) => [...current, { roomId: review.reviewRoomId, previous: review }]);
  };

  const confirmAndNext = () => {
    pushUndo();
    const nextId = pickNextId(review.reviewRoomId);
    update(review.reviewRoomId, { decision: "accepted" });
    setActiveId(nextId);
  };

  const excludeRoom = () => {
    pushUndo();
    const nextId = pickNextId(review.reviewRoomId);
    update(review.reviewRoomId, { decision: "excluded" });
    setActiveId(nextId);
  };

  const skip = () => {
    setActiveId(pickNextId(review.reviewRoomId));
  };

  const undo = () => {
    setUndoStack((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      update(last.roomId, last.previous);
      setActiveId(last.roomId);
      return current.slice(0, -1);
    });
  };

  const swapLengthWidth = () => {
    update(review.reviewRoomId, { length: review.width, width: review.length });
  };

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-violet-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-violet-50 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-950">Room review</p>
          <p className="mt-0.5 text-xs font-medium text-violet-800" role="status" aria-live="polite">
            {status === "running"
              ? `Scanning remaining pages... (${loadedRoomCount} rooms loaded)`
              : `Scan complete (${loadedRoomCount} rooms loaded)`}
          </p>
        </div>
        {onCreateProject ? (
          <button
            type="button"
            onClick={onCreateProject}
            disabled={status !== "complete" || isCreatingProject}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingProject ? "Creating project..." : "Create project"}
          </button>
        ) : null}
      </div>
      <nav className="w-full max-w-full border-b border-slate-200 bg-white p-2" aria-label="Loaded room queue">
        <ol className="flex w-full min-w-0 flex-wrap gap-2">
          {reviews.map((item, index) => (
            <li key={item.reviewRoomId} className="min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => setActiveId(item.reviewRoomId)}
                aria-current={item.reviewRoomId === review.reviewRoomId ? "true" : undefined}
                className={`max-w-full rounded-md border px-3 py-1.5 text-left text-xs ${
                  item.reviewRoomId === review.reviewRoomId
                    ? "border-violet-500 bg-violet-50 text-violet-950"
                    : "border-slate-200 text-slate-700 hover:border-violet-300"
                }`}
              >
                <span className="block max-w-48 truncate font-semibold sm:max-w-56">{item.name || `Room ${index + 1}`}</span>
                <span className="capitalize text-slate-500">{item.decision}</span>
              </button>
            </li>
          ))}
          {status === "running" ? <li className="h-12 w-24 animate-pulse rounded-md bg-violet-100" aria-hidden="true" /> : null}
        </ol>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
        <span className="font-semibold text-slate-700">Review room {displayIndex} of {reviews.length}</span>
        <span className="font-semibold text-violet-900">{review.name || "Unnamed room"}</span>
      </div>
      <div className="h-1 w-full bg-slate-100" aria-hidden="true">
        <div
          className="h-full bg-violet-600 transition-[width] duration-300"
          style={{ width: `${((displayIndex - 1) / Math.max(1, reviews.length)) * 100}%` }}
        />
      </div>

      <div className="grid gap-0 lg:grid-cols-12">
        <div className="min-w-0 border-b border-slate-200 p-3 lg:col-span-7 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
            <span>Room evidence</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode((mode) => (mode === "full" ? "crop" : "full"))}
                disabled={!overviewId || !cropId}
                className="min-h-[32px] rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {viewMode === "full" ? "Room crop" : "Full page"}
              </button>
              <button
                type="button"
                onClick={() => focusOnBox(roomFocusBox, naturalSize, { smooth: true })}
                className="min-h-[32px] rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
              >
                Fit to room
              </button>
            </div>
          </div>
          {imageId && token && !imageFailed && !imageFetchFailed ? (
            <div
              ref={scrollRef}
              className="relative mt-2 h-[38vh] max-h-[420px] min-h-[260px] touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-lg border border-slate-300 bg-slate-100 lg:h-[480px] lg:max-h-[55vh]"
              tabIndex={0}
              aria-label="Scrollable plan evidence - drag or swipe to pan, pinch or use the zoom buttons below"
            >
              {imageSrc ? (
              /* Natural image size (not stretched to container width) so the full sheet
                  overflows and becomes scrollable/pannable in every direction. */
              <div className="relative inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
                <img
                  src={imageSrc}
                  alt={viewMode === "full" ? `Full plan sheet for ${review.name || "room"}` : `Plan crop for ${review.name || "room"}`}
                  className="block h-auto w-auto max-w-none"
                  onLoad={(event) => {
                    const next = { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight, forImageId: imageId ?? "" };
                    setNaturalSize(next);
                    focusOnBox(roomFocusBox, next);
                  }}
                  onError={() => setImageFailed(true)}
                />
                {sourceRoom?.location.pdf_points && (
                  <span
                    className="pointer-events-none absolute border-2 border-emerald-600 bg-emerald-300/20"
                    style={imagePercentBox(result, imageId, sourceRoom.location.pdf_points) ?? {}}
                    aria-label="Room location"
                  />
                )}
                {selectedBoxes.map((item) => (
                  <span
                    key={item.axis}
                    style={item.style}
                    className={`pointer-events-none absolute border-2 ${item.axis === "length" ? "border-blue-600 bg-blue-400/20" : "border-amber-500 bg-amber-300/25"}`}
                    aria-hidden="true"
                  >
                    {/* Anchored to this specific box's own rendered position (not a
                        fixed corner of the viewer) - and only rendered at all when
                        this axis actually has a valid mapped box, so a room with
                        no scaled coordinates for an axis shows no stray badge. */}
                    <span
                      className={`absolute -top-5 left-0 whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold uppercase ${
                        item.axis === "length" ? "bg-blue-700 text-white" : "bg-amber-500 text-slate-950"
                      }`}
                    >
                      {item.axis}
                    </span>
                    {debugMode && (
                      <span className="absolute -top-4 left-0 whitespace-nowrap rounded bg-slate-950/80 px-1 text-[9px] font-mono text-white">
                        {item.axis} [{item.box.x0.toFixed(1)}, {item.box.y0.toFixed(1)}, {item.box.x1.toFixed(1)}, {item.box.y1.toFixed(1)}]
                      </span>
                    )}
                  </span>
                ))}
              </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">Loading image...</div>
              )}
            </div>
          ) : (
            <div className="mt-2 flex h-[38vh] max-h-[420px] min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500 lg:h-[480px] lg:max-h-[55vh]">
              {sourceRoom ? "We couldn't load the plan image for this room, or it has expired. Check your original PDF before making corrections." : "There's no plan image for a room you added manually."}
              {(imageFailed || imageFetchFailed) && (
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => {
                    setImageFailed(false);
                    retryImageFetch();
                  }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center justify-center gap-3 text-xs">
            <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM} className="min-h-[32px] rounded border px-2 py-1" aria-label="Zoom out">−</button>
            <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM} className="min-h-[32px] rounded border px-2 py-1" aria-label="Zoom in">+</button>
          </div>
        </div>

        <div className="min-w-0 p-4 lg:col-span-5">
          {requiresInclusionReview && (
            <p className="mb-3 rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
              Flagged for an inclusion decision — confirm this should be counted as a room.
            </p>
          )}
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
            Room name
            <input
              value={review.name}
              onChange={(event) => update(review.reviewRoomId, { name: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold normal-case text-slate-900"
            />
          </label>

          <div className="mt-4 space-y-4">
            <DimensionField
              axis="length"
              label="Length"
              value={review.length}
              candidates={candidates}
              result={result}
              sourceRoomId={sourceRoom?.room_id ?? null}
              onChange={(patch) => updateAxis(review.reviewRoomId, "length", patch)}
            />
            <DimensionField
              axis="width"
              label="Width"
              value={review.width}
              candidates={candidates}
              result={result}
              sourceRoomId={sourceRoom?.room_id ?? null}
              onChange={(patch) => updateAxis(review.reviewRoomId, "width", patch)}
            />
          </div>

          <button
            type="button"
            onClick={swapLengthWidth}
            className="mt-3 inline-flex min-h-[32px] items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            ⇄ Swap length / width
          </button>

          {envelope && (
            <div className="mt-4 space-y-2">
              {(["window", "door"] as const).map((openingType) => {
                const label = openingType === "window" ? "Windows" : "Exterior doors";
                const totalArea = openingType === "window" ? envelope.windows_area_m2 : envelope.doors_area_m2;
                const cleared = openingType === "window" ? review.windowsAreaCleared : review.doorsAreaCleared;
                const marks = (envelope.openings ?? []).filter((item) => item.opening_type === openingType);
                const matchedMarks = marks.filter((item) => item.matched_from_schedule && item.total_area_m2 != null);
                const unmatchedMarks = marks.filter((item) => !item.matched_from_schedule);
                if (!totalArea && unmatchedMarks.length === 0) return null;
                return (
                  <div key={openingType}>
                    {totalArea && !cleared ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                        <span className="font-semibold text-emerald-900">
                          {matchedMarks.reduce((sum, item) => sum + item.count, 0)} {label.toLowerCase()}:{" "}
                          {matchedMarks.map((item) => `#${item.mark}`).join(", ")} = {formatArea(totalArea.value)}
                        </span>
                        <button
                          type="button"
                          onClick={() => update(
                            review.reviewRoomId,
                            openingType === "window" ? { windowsAreaCleared: true } : { doorsAreaCleared: true },
                          )}
                          className="font-semibold text-emerald-700 underline"
                        >
                          Clear
                        </button>
                      </div>
                    ) : totalArea && cleared ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span>{label} cleared — won't be filled in automatically.</span>
                        <button
                          type="button"
                          onClick={() => update(
                            review.reviewRoomId,
                            openingType === "window" ? { windowsAreaCleared: false } : { doorsAreaCleared: false },
                          )}
                          className="font-semibold text-violet-800 underline"
                        >
                          Restore
                        </button>
                      </div>
                    ) : null}
                    {unmatchedMarks.length > 0 && (
                      <p className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {unmatchedMarks.reduce((sum, item) => sum + item.count, 0)} {label.toLowerCase()} tag
                        {unmatchedMarks.reduce((sum, item) => sum + item.count, 0) === 1 ? "" : "s"} detected (
                        {unmatchedMarks.map((item) => `#${item.mark}`).join(", ")}) — confirm total area.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {debugMode && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-dashed border-violet-300 bg-violet-50 p-2 font-mono text-[10px] text-violet-900">
              <dt className="font-semibold">image_id</dt><dd className="truncate">{imageId ?? "—"}</dd>
            </dl>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={confirmAndNext}
              disabled={!review.name.trim()}
              className="min-h-[40px] w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm &amp; Next
            </button>
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <button type="button" onClick={undo} disabled={undoStack.length === 0} className="min-h-[32px] text-slate-600 underline disabled:cursor-not-allowed disabled:opacity-40">
                Undo
              </button>
              <button type="button" onClick={skip} className="min-h-[32px] text-slate-600 underline">
                Skip
              </button>
              <button type="button" onClick={excludeRoom} className="min-h-[32px] text-red-700 underline">
                Exclude
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
