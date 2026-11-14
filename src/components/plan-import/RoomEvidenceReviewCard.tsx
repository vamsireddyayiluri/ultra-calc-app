import { useEffect, useState, type CSSProperties } from "react";
import type {
  V2Box,
  V2ExtractionResult,
  V2RoomDimensionAssociation,
  V2RoomInstance,
} from "../../plan-import/api/experimentalV2Client";
import { experimentalV2EvidenceImageUrl } from "../../plan-import/api/experimentalV2Client";
import type {
  V2AxisReviewSelection,
  V2RoomReviewSelection,
} from "../../plan-import/pipeline/convertV2ReviewToRoomInput";
import { eligibleV2Associations } from "../../plan-import/pipeline/v2Eligibility";

interface Props {
  result: V2ExtractionResult;
  review: V2RoomReviewSelection;
  sourceRoom: V2RoomInstance | null;
  backendUrl: string;
  allReviews: V2RoomReviewSelection[];
  update: (patch: Partial<V2RoomReviewSelection>) => void;
  updateAxis: (axis: "length" | "width", patch: Partial<V2AxisReviewSelection>) => void;
  debugMode?: boolean;
}

function applyMatrix(matrix: number[], x: number, y: number): [number, number] {
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / w,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / w,
  ];
}

function imagePercentBox(result: V2ExtractionResult, imageId: string, box: V2Box): CSSProperties | null {
  const image = result.images.find((item) => item.image_id === imageId);
  if (!image) return null;
  const pdfToPage = image.transforms.find((item) => item.from_space_id === "pdf_points" && item.to_space_id === "page_pixels");
  const pageToImage = image.transforms.find((item) => item.from_space_id === "page_pixels" && item.to_space_id === `${imageId}:pixels`);
  if (!pdfToPage || !pageToImage) return null;
  const corners = [
    [box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1],
  ].map(([x, y]) => {
    const page = applyMatrix(pdfToPage.matrix, x, y);
    return applyMatrix(pageToImage.matrix, page[0], page[1]);
  });
  const xs = corners.map((point) => point[0]);
  const ys = corners.map((point) => point[1]);
  const left = Math.max(0, Math.min(...xs) / image.width_pixels * 100);
  const top = Math.max(0, Math.min(...ys) / image.height_pixels * 100);
  const right = Math.min(100, Math.max(...xs) / image.width_pixels * 100);
  const bottom = Math.min(100, Math.max(...ys) / image.height_pixels * 100);
  if (right <= left || bottom <= top) return null;
  return { left: `${left}%`, top: `${top}%`, width: `${right - left}%`, height: `${bottom - top}%` };
}

function evidenceImageId(result: V2ExtractionResult, room: V2RoomInstance | null): string | null {
  if (!room) return null;
  const context = room.evidence_ids.find((id) => id.endsWith(":review-context") && result.images.some((image) => image.image_id === id));
  if (context) return context;
  return result.associations
    .filter((association) => association.room_id === room.room_id)
    .flatMap((association) => association.evidence_ids)
    .find((id) => result.images.some((image) => image.image_id === id)) ?? null;
}

const DECISION_LABELS: Record<string, string> = {
  pending: "Needs review",
  accepted: "Accepted",
  excluded: "Excluded",
};

function AxisEditor({
  axis,
  result,
  sourceRoom,
  value,
  allAssociations,
  update,
}: {
  axis: "length" | "width";
  result: V2ExtractionResult;
  sourceRoom: V2RoomInstance | null;
  value: V2AxisReviewSelection;
  allAssociations: V2RoomDimensionAssociation[];
  update: (patch: Partial<V2AxisReviewSelection>) => void;
}) {
  const candidates = sourceRoom ? eligibleV2Associations(result, sourceRoom.room_id, axis) : [];
  const dimensionById = new Map(result.dimensions.map((item) => [item.dimension_id, item]));
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white p-3">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-700">{axis}</legend>
      <select
        value={value.kind}
        onChange={(event) => update({
          kind: event.target.value as V2AxisReviewSelection["kind"],
          associationId: "",
          rawText: "",
          sourceAssociationId: "",
        })}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="evidence" disabled={!sourceRoom || candidates.length === 0}>Use a detected measurement</option>
        <option value="human_correction">Enter a correction</option>
        <option value="missing">Leave blank</option>
      </select>
      {value.kind === "evidence" ? (
        <select
          value={value.associationId}
          onChange={(event) => update({ associationId: event.target.value })}
          className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Choose a detected measurement</option>
          {candidates.map((association) => {
            const dimension = dimensionById.get(association.dimension_id);
            return <option key={association.association_id} value={association.association_id}>{dimension?.raw_text ?? association.dimension_id}</option>;
          })}
        </select>
      ) : value.kind === "human_correction" ? (
        <div className="mt-2 space-y-2">
          <input
            value={value.rawText}
            onChange={(event) => update({ rawText: event.target.value })}
            placeholder={'Examples: 12\'-6", 3.8 m, 4200 mm'}
            aria-label={`${axis} corrected value`}
            className="w-full rounded border border-amber-400 bg-amber-50 px-2 py-1.5 text-sm"
          />
          {sourceRoom ? (
            <select
              value={value.sourceAssociationId}
              onChange={(event) => {
                const sourceAssociationId = event.target.value;
                const sourceAssociation = allAssociations.find(
                  (association) => association.association_id === sourceAssociationId,
                );
                const observedText = sourceAssociation
                  ? dimensionById.get(sourceAssociation.dimension_id)?.raw_text
                  : null;
                update({
                  sourceAssociationId,
                  ...(observedText ? { rawText: observedText } : {}),
                });
              }}
              aria-label={`${axis} correction source evidence`}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value="">Choose a detected value to use (optional)</option>
              {allAssociations.map((association) => (
                <option key={association.association_id} value={association.association_id}>
                  {dimensionById.get(association.dimension_id)?.raw_text ?? association.dimension_id}
                </option>
              ))}
            </select>
          ) : null}
          <p className="text-[11px] text-amber-800">Choosing a detected value fills in its text so you can confirm or edit it. Your edit is saved as a manual correction and won't change the original detected value.</p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">This room will keep its {axis} at zero until you finish it in the room editor.</p>
      )}
    </fieldset>
  );
}

export default function RoomEvidenceReviewCard({ result, review, sourceRoom, backendUrl, allReviews, update, updateAxis, debugMode = false }: Props) {
  const [showSheet, setShowSheet] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const overviewId = result.images.find((image) => image.page_id === sourceRoom?.page_id && image.role === "overview")?.image_id;
  const imageId = showSheet ? overviewId ?? null : evidenceImageId(result, sourceRoom);
  useEffect(() => { setImageFailed(false); setZoom(1); }, [imageId]);
  const associations = sourceRoom ? result.associations.filter((item) => item.room_id === sourceRoom.room_id) : [];
  const associationById = new Map(associations.map((item) => [item.association_id, item]));
  const dimensionById = new Map(result.dimensions.map((item) => [item.dimension_id, item]));
  const selected = ([review.length, review.width] as const).map((axis, index) => {
    const associationId = axis.kind === "evidence" ? axis.associationId : axis.sourceAssociationId;
    const association = associationById.get(associationId);
    const location = association ? dimensionById.get(association.dimension_id)?.location?.pdf_points : null;
    return location && imageId
      ? { axis: index === 0 ? "length" : "width", box: location, style: imagePercentBox(result, imageId, location) }
      : null;
  }).filter((item): item is { axis: string; box: V2Box; style: CSSProperties } => Boolean(item?.style));
  const token = result.run.artifact_access_token;
  const pageNumber = review.sourcePageNumber;
  const requiresInclusionReview = sourceRoom?.import_eligibility === "requires_review";
  const spaceCategory = sourceRoom?.space_category?.replace(/_/g, " ") ?? "room";
  const currentImage = imageId ? result.images.find((image) => image.image_id === imageId) ?? null : null;

  return (
    <li className={`rounded-xl border p-4 ${review.decision === "excluded" ? "border-slate-300 bg-slate-50 opacity-80" : "border-slate-200 bg-white"}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,1.1fr)_minmax(20rem,1fr)]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>{sourceRoom ? `Page ${pageNumber} · source room` : `Page ${pageNumber} · manually added room`}</span>
            <span className="rounded bg-slate-100 px-2 py-1 font-semibold uppercase">{DECISION_LABELS[review.decision] ?? review.decision}</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1} className="rounded border px-2 py-1" aria-label="Zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.5))} disabled={zoom >= 4} className="rounded border px-2 py-1" aria-label="Zoom in">+</button>
            <button type="button" onClick={() => setShowSheet((value) => !value)} disabled={!overviewId} className="rounded border px-2 py-1">{showSheet ? "Close-up view" : "Show on full page"}</button>
          </div>
          {imageId && token && !imageFailed ? (
            <div className="max-h-[36rem] overflow-auto rounded-lg border border-slate-300 bg-slate-100" tabIndex={0} aria-label="Scrollable plan evidence">
            <div className="relative" style={{ width: `${zoom * 100}%` }}>
              <img
                src={experimentalV2EvidenceImageUrl(backendUrl, token, imageId)}
                alt={`Original plan context for ${review.name || "room"}`}
                className="block h-auto w-full"
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
              {showSheet && sourceRoom?.location.pdf_points && <span className="pointer-events-none absolute border-2 border-emerald-600 bg-emerald-300/20" style={imagePercentBox(result, imageId, sourceRoom.location.pdf_points) ?? {}} aria-label="Room location" />}
              {selected.map((item) => (
                <span
                  key={item.axis}
                  style={item.style}
                  className={`pointer-events-none absolute border-2 ${item.axis === "length" ? "border-blue-600 bg-blue-400/20" : "border-amber-500 bg-amber-300/25"}`}
                  aria-hidden="true"
                >
                  {debugMode && (
                    <span className="absolute -top-4 left-0 whitespace-nowrap rounded bg-slate-950/80 px-1 text-[9px] font-mono text-white">
                      {item.axis} [{item.box.x0.toFixed(1)}, {item.box.y0.toFixed(1)}, {item.box.x1.toFixed(1)}, {item.box.y1.toFixed(1)}]
                    </span>
                  )}
                </span>
              ))}
              <div className="absolute bottom-2 left-2 flex gap-2 text-[10px] font-bold uppercase">
                <span className="rounded bg-blue-700 px-2 py-1 text-white">Length</span>
                <span className="rounded bg-amber-500 px-2 py-1 text-slate-950">Width</span>
              </div>
            </div></div>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
              {sourceRoom ? "We couldn't load the plan image for this room, or it has expired. Check your original PDF before making corrections." : "There's no plan image for a room you added manually."}
              {imageFailed && <button type="button" className="ml-2 underline" onClick={() => setImageFailed(false)}>Try again</button>}
            </div>
          )}
          {sourceRoom && imageId ? <p className="mt-1 text-xs text-slate-500">This image is generated automatically from the room and measurement locations on your plan.</p> : null}
          {debugMode && currentImage && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-dashed border-violet-300 bg-violet-50 p-2 font-mono text-[10px] text-violet-900">
              <dt className="font-semibold">image_id</dt><dd className="truncate">{currentImage.image_id}</dd>
              <dt className="font-semibold">source_pdf_box</dt>
              <dd>[{currentImage.source_pdf_box.x0.toFixed(1)}, {currentImage.source_pdf_box.y0.toFixed(1)}, {currentImage.source_pdf_box.x1.toFixed(1)}, {currentImage.source_pdf_box.y1.toFixed(1)}]</dd>
              <dt className="font-semibold">render_dpi</dt><dd>{currentImage.render_dpi.toFixed(1)} ({(currentImage.render_dpi / 72).toFixed(3)}x scale)</dd>
              <dt className="font-semibold">pixels</dt><dd>{currentImage.width_pixels} × {currentImage.height_pixels}</dd>
              {sourceRoom?.location.pdf_points && (
                <>
                  <dt className="font-semibold">room_box</dt>
                  <dd>[{sourceRoom.location.pdf_points.x0.toFixed(1)}, {sourceRoom.location.pdf_points.y0.toFixed(1)}, {sourceRoom.location.pdf_points.x1.toFixed(1)}, {sourceRoom.location.pdf_points.y1.toFixed(1)}]</dd>
                </>
              )}
            </dl>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
            Room name
            <input value={review.name} onChange={(event) => update({ name: event.target.value, decision: "pending" })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base font-semibold normal-case text-slate-900" />
          </label>
          {sourceRoom ? (
            <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${requiresInclusionReview ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <span className="font-semibold capitalize">{spaceCategory}</span>
              {requiresInclusionReview ? (
                <span> · Named space found on the plan. Decide whether it belongs in this project.</span>
              ) : (
                <span> · Ready for normal room review.</span>
              )}
            </div>
          ) : null}
          {!sourceRoom && result.pages.length > 1 ? (
            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Source page
              <select
                value={review.sourcePageNumber}
                onChange={(event) => update({ sourcePageNumber: Number(event.target.value), decision: "pending" })}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-900"
              >
                {result.pages.map((page) => (
                  <option key={page.page_id} value={page.source_page_number}>Page {page.source_page_number}</option>
                ))}
              </select>
            </label>
          ) : null}
          {review.decision !== "excluded" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <AxisEditor axis="length" result={result} sourceRoom={sourceRoom} value={review.length} allAssociations={associations} update={(patch) => updateAxis("length", patch)} />
              <AxisEditor axis="width" result={result} sourceRoom={sourceRoom} value={review.width} allAssociations={associations} update={(patch) => updateAxis("width", patch)} />
            </div>
          ) : (
            <label className="mt-3 block text-xs font-bold uppercase text-slate-600">
              Duplicate of (optional)
              <select value={review.duplicateOfReviewRoomId} onChange={(event) => update({ duplicateOfReviewRoomId: event.target.value })} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal normal-case">
                <option value="">Excluded for another reason</option>
                {allReviews.filter((item) => item.reviewRoomId !== review.reviewRoomId && item.decision !== "excluded").map((item) => <option key={item.reviewRoomId} value={item.reviewRoomId}>{item.name || "Unnamed room"}</option>)}
              </select>
            </label>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {review.decision !== "excluded" ? (
              <>
                <button type="button" disabled={!review.name.trim()} onClick={() => update({ decision: "accepted", duplicateOfReviewRoomId: "" })} className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save room review</button>
                <button type="button" onClick={() => update({ decision: "excluded" })} className="rounded border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700">Exclude room</button>
              </>
            ) : (
              <button type="button" onClick={() => update({ decision: "pending", duplicateOfReviewRoomId: "" })} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Restore room</button>
            )}
          </div>
          {sourceRoom ? (
            <details className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold">See all detected measurements ({associations.length})</summary>
              <ul className="mt-2 space-y-1">
                {associations.map((association) => <li key={association.association_id}>{dimensionById.get(association.dimension_id)?.raw_text ?? association.dimension_id} · {association.span_type.replace(/_/g, " ")}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}
