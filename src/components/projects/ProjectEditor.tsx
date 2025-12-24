import React, { useState } from "react";
import {
  ProjectSettings,
  RoomInput,
  ProjectSummary, 
} from "../../models/projectTypes";
import { ProjectForm } from "../forms/ProjectForm";
import { RoomCard } from "../rooms/RoomCard";
import { SummaryCard } from "../summary/SummaryCard";
import { calculateRoom } from "../../utils/physics";

interface ProjectEditorProps {
  project: ProjectSettings & { rooms: RoomInput[] };
  rooms: RoomInput[];
  onUpdateProject: (patch: Partial<ProjectSettings>) => void;
  onUpdateRoom: (id: string, patch: Partial<RoomInput>) => void;
  onAddRoom: () => void;
  onRemoveRoom: (id: string) => void;
  summary: ProjectSummary | null;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({
  project,
  rooms,
  onUpdateProject,
  onUpdateRoom,
  onAddRoom,
  onRemoveRoom,
  summary,
}) => {
  const [activeTab, setActiveTab] = useState<"details" | "rooms" | "summary">(
    "details"
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg p-0">
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
            onClick={() => setActiveTab(tab as any)}
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
          <ProjectForm project={project} onUpdate={onUpdateProject} />
        </div>
      )}

      {activeTab === "rooms" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-slate-800">Rooms</h3>
            <button
              onClick={onAddRoom}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                         bg-[#22D3EE] text-[#042029] hover:bg-[#18c6dd] transition-colors shadow-sm"
            >
              + Add Room
            </button>
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
