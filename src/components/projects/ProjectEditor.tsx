import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsDown, ChevronsUp } from "lucide-react";
import {
  ProjectSettings,
  RoomInput,
  ProjectSummary,
} from "../../models/projectTypes";
import { ProjectForm } from "../forms/ProjectForm";
import { RoomCard } from "../rooms/RoomCard";
import { SummaryCard } from "../summary/SummaryCard";
import { calculateRoom } from "../../utils/physics";
import { validateProject } from "../../validations.ts/projectValidator";
import { useProjectDirtyTracker } from "../../hooks/useProjectDirtyTracker";
import { ProjectStatusCard } from "../validation/ProjectStatusCard";
import { ValidationNavigateTarget } from "../validation/ValidationSummary";

interface ProjectEditorProps {
  project: ProjectSettings & { rooms: RoomInput[] };
  rooms: RoomInput[];
  onUpdateProject: (patch: Partial<ProjectSettings>) => void;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;
  onRemoveRoom: (id: string) => void;
  onAddRoom: () => void;
  summary: ProjectSummary | null;
  onTabChange?: (tab: "details" | "rooms" | "summary") => void;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({
  project,
  rooms,
  onUpdateProject,
  onUpdateRoom,
  onRemoveRoom,
  onAddRoom,
  summary,
  onTabChange, // ✅ here
}) => {
  const [activeTab, setActiveTab] = useState<"details" | "rooms" | "summary">(
    "details",
  );

  // Which rooms are expanded — pure UI state, not persisted, not part of
  // the room data model. A small project (<=1 room) starts fully open;
  // a larger one starts collapsed so opening a project with many rooms
  // doesn't dump a huge scroll on the user immediately. A room newly
  // added via onAddRoom auto-expands (see the effect below), since the
  // very next thing the user wants to do with it is fill it in.
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(
    () => new Set(rooms.length <= 1 ? rooms.map((r) => r.id) : []),
  );
  const previousRoomIdsRef = useRef<string[]>(rooms.map((r) => r.id));

  useEffect(() => {
    const previousIds = new Set(previousRoomIdsRef.current);
    const addedIds = rooms
      .map((r) => r.id)
      .filter((id) => !previousIds.has(id));
    if (addedIds.length > 0) {
      setExpandedRoomIds((prev) => new Set([...prev, ...addedIds]));
    }
    previousRoomIdsRef.current = rooms.map((r) => r.id);
  }, [rooms]);

  const toggleRoomExpanded = (id: string) =>
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAllRooms = () =>
    setExpandedRoomIds(new Set(rooms.map((r) => r.id)));
  const collapseAllRooms = () => setExpandedRoomIds(new Set());

  // Single source of truth for validation — computed once here and passed
  // down as props; nothing downstream re-derives or re-implements these
  // rules. Purely a synchronous, read-only classification: it never
  // blocks editing, adding rooms, saving, or navigating between tabs.
  const validation = useMemo(() => validateProject(project), [project]);

  // Foundation for future drafts/autosave/save phases (see
  // docs/PROJECT_WORKFLOW.md): tracks what has changed since the last
  // known-saved snapshot and derives one headline status by combining
  // that with the validator's own status above. Nothing here saves
  // anything or blocks anything — see useProjectDirtyTracker's markSaved/
  // markSaving/markSaveError for the extension points a future save
  // mechanism will call.
  const dirtyTracker = useProjectDirtyTracker(project, validation.status);

  // A single pending "jump to this field" request, set by clicking an item
  // in ValidationSummary. Reuses the same field-level data the summary
  // already lists — this doesn't re-derive anything, it just routes an
  // existing (scope, field) pair to the right tab/room and hands it to
  // ProjectForm/RoomCard, which own the actual scroll/focus behavior.
  const focusNonceRef = useRef(0);
  const [pendingFocus, setPendingFocus] = useState<
    | { scope: "project"; field: string; nonce: number }
    | { scope: "room"; roomId: string; field: string; nonce: number }
    | null
  >(null);

  const navigateToIssue = (target: ValidationNavigateTarget) => {
    focusNonceRef.current += 1;
    const nonce = focusNonceRef.current;
    if (target.scope === "project") {
      setActiveTab("details");
      onTabChange?.("details");
      setPendingFocus({ scope: "project", field: target.field, nonce });
    } else {
      setActiveTab("rooms");
      onTabChange?.("rooms");
      setExpandedRoomIds((prev) => new Set(prev).add(target.roomId));
      setPendingFocus({
        scope: "room",
        roomId: target.roomId,
        field: target.field,
        nonce,
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-0">
      <ProjectStatusCard
        tracker={dirtyTracker}
        validation={validation}
        onNavigate={navigateToIssue}
      />

      {/* Tabs */}
      <div className="flex items-center justify-around mb-6 border-b border-slate-200">
        {["details", "rooms", "summary"].map((tab) => (
          <button
            key={tab}
            className={`flex-1 py-3 text-sm font-semibold capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[#1E3A8A] text-[#1E3A8A]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => {
              const selectedTab = tab as "details" | "rooms" | "summary";

              setActiveTab(selectedTab);
              onTabChange?.(selectedTab);
            }}
          >
            {tab === "details"
              ? "Project Details"
              : tab === "rooms"
                ? "Rooms"
                : "Summary"}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "details" && (
        <div className="animate-fadeIn">
          <ProjectForm
            project={project}
            onUpdate={onUpdateProject}
            validation={validation}
            focusFieldRequest={
              pendingFocus?.scope === "project"
                ? { field: pendingFocus.field, nonce: pendingFocus.nonce }
                : null
            }
          />
        </div>
      )}

      {activeTab === "rooms" && (
        <div className="space-y-3 animate-fadeIn">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold text-slate-800">Rooms</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {rooms.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {rooms.length > 1 && (
                <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <button
                    type="button"
                    onClick={expandAllRooms}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronsDown size={13} aria-hidden="true" />
                    Expand all
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={collapseAllRooms}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ChevronsUp size={13} aria-hidden="true" />
                    Collapse all
                  </button>
                </div>
              )}
            </div>
          </div>

          {rooms.length === 0 && (
            <p className="text-sm text-slate-500 italic">
              No rooms yet. Click “+ Add Room” to start.
            </p>
          )}

          {rooms.map((room) => (
            <div key={room.id} className="bg-white p-0">
              <RoomCard
                room={room}
                project={project}
                onUpdateRoom={onUpdateRoom}
                onRemoveRoom={onRemoveRoom}
                calculateRoom={calculateRoom}
                roomValidation={validation.rooms[room.id]}
                isExpanded={expandedRoomIds.has(room.id)}
                onToggleExpand={() => toggleRoomExpanded(room.id)}
                focusFieldRequest={
                  pendingFocus?.scope === "room" &&
                  pendingFocus.roomId === room.id
                    ? { field: pendingFocus.field, nonce: pendingFocus.nonce }
                    : null
                }
              />
            </div>
          ))}
        </div>
      )}

      {activeTab === "summary" && (
        <div className="animate-fadeIn">
          <SummaryCard summary={summary} project={project} />
        </div>
      )}
    </div>
  );
};
