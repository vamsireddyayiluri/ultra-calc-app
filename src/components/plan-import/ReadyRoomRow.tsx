import type { V2ExtractionResult } from "../../plan-import/api/experimentalV2Client";
import type { V2RoomReviewSelection } from "../../plan-import/pipeline/convertV2ReviewToRoomInput";

interface Props {
  review: V2RoomReviewSelection;
  result: V2ExtractionResult;
  onAccept: () => void;
  onReviewInDetail: () => void;
}

function axisRawText(result: V2ExtractionResult, associationId: string): string | null {
  const association = result.associations.find((item) => item.association_id === associationId);
  if (!association) return null;
  return result.dimensions.find((item) => item.dimension_id === association.dimension_id)?.raw_text ?? null;
}

// Compact row for rooms whose name and both dimensions were detected without ambiguity -
// avoids forcing the user through the full evidence-image card for every confident room.
export default function ReadyRoomRow({ review, result, onAccept, onReviewInDetail }: Props) {
  const lengthText = axisRawText(result, review.length.associationId);
  const widthText = axisRawText(result, review.width.associationId);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
      <div>
        <p className="font-semibold text-slate-900">{review.name}</p>
        <p className="text-xs text-slate-500">Length {lengthText ?? "?"} · Width {widthText ?? "?"}</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onReviewInDetail} className="text-xs font-semibold text-violet-800 underline">
          Double-check this one
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
        >
          Accept
        </button>
      </div>
    </li>
  );
}
