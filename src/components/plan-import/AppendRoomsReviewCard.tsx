import { Check, GitMerge, Plus } from "lucide-react";
import type { ConvertedV2RoomInput } from "../../plan-import/pipeline/convertV2ReviewToRoomInput";
import type { AppendRoomCandidate } from "../../plan-import/pipeline/detectExistingRoomDuplicates";
import type { AppendRoomDecision } from "../../services/firebaseHelpers";
import type { Region, RoomInput } from "../../models/projectTypes";
import { toDisplayLength } from "../../utils/display";

interface AppendRoomsReviewCardProps {
  candidates: AppendRoomCandidate[];
  existingRooms: RoomInput[];
  region: Region;
  decisions: Record<string, AppendRoomDecision>;
  onDecisionChange: (reviewRoomId: string, decision: AppendRoomDecision) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}

function lengthUnit(region: Region): string {
  return region === "US" || region === "CA_IMPERIAL" ? "ft" : "m";
}

function formatDimensions(room: Pick<RoomInput, "length_m" | "width_m">, region: Region): string {
  const unit = lengthUnit(region);
  const length = toDisplayLength(region, room.length_m);
  const width = toDisplayLength(region, room.width_m);
  if (length == null || width == null) return "No dimensions";
  return `${length} × ${width} ${unit}`;
}

function convertedRoom(candidate: AppendRoomCandidate): ConvertedV2RoomInput {
  return candidate.convertedRoom;
}

export default function AppendRoomsReviewCard({
  candidates,
  existingRooms,
  region,
  decisions,
  onDecisionChange,
  onConfirm,
  onCancel,
  isSaving,
  error,
}: AppendRoomsReviewCardProps) {
  const existingById = new Map(existingRooms.map((room) => [room.id, room]));
  const applyCount = candidates.filter((c) => decisions[c.convertedRoom.reviewRoomId] !== "skip").length;

  return (
    <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <GitMerge size={18} className="text-emerald-700" aria-hidden="true" />
        Compare with existing rooms
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Review each room found in this scan before it's added to the project. A matching name doesn't
        mean it's the same room - decide for each one.
      </p>

      <div className="mt-4 space-y-3">
        {candidates.map((candidate) => {
          const room = convertedRoom(candidate);
          const decision = decisions[room.reviewRoomId] ?? "add";
          const matchedRoom = candidate.matchedExistingRoomId
            ? existingById.get(candidate.matchedExistingRoomId) ?? null
            : null;

          return (
            <div key={room.reviewRoomId} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{room.roomInput.name}</p>
                  <p className="text-sm text-slate-500">
                    Page {room.pageNumber} · {formatDimensions(room.roomInput, region)}
                  </p>
                </div>
                {!matchedRoom && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    <Plus size={12} aria-hidden="true" /> New room
                  </span>
                )}
              </div>

              {matchedRoom ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Possible match in this project
                  </p>
                  <p className="mt-1 text-sm text-amber-900">
                    "{matchedRoom.name}" - {formatDimensions(matchedRoom, region)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {([
                      ["add", "Add as a separate new room"],
                      ["replace", `Replace "${matchedRoom.name}" with this scanned room`],
                      ["skip", `Keep "${matchedRoom.name}" as-is, discard this scan`],
                    ] as const).map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          decision === value
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`decision-${room.reviewRoomId}`}
                          value={value}
                          checked={decision === value}
                          onChange={() => onDecisionChange(room.reviewRoomId, value)}
                          className="h-4 w-4"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No existing room has this name - will be added as new.</p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSaving || applyCount === 0}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          <Check size={16} aria-hidden="true" />
          {isSaving ? "Saving to project..." : `Apply ${applyCount} room change${applyCount === 1 ? "" : "s"} to project`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
