// src/components/export/ProjectExportView.tsx
import React from "react";
import { RoomCard } from "../rooms/RoomCard";
import { SummaryCard } from "../summary/SummaryCard";
import { calculateRoom } from "../../utils/physics";
import type {
  ProjectSettings,
  RoomInput,
  ProjectSummary,
} from "../../models/projectTypes";

interface ProjectExportViewProps {
  project: ProjectSettings;
  rooms: RoomInput[];
  summary: ProjectSummary | null;
}

export const ProjectExportView = React.forwardRef<
  HTMLDivElement,
  ProjectExportViewProps
>(({ project, rooms, summary }, ref) => {
  return (
    <div ref={ref} className="bg-white p-6 space-y-6 export-root">
      {/* LOGO */}
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo" className="h-10" />
      </div>

      {/* PROJECT INFO (read-only) */}
      <div className="text-sm text-slate-700 space-y-1">
        <div><strong>Project:</strong> {project.name}</div>
        <div><strong>Region:</strong> {project.region}</div>
        {project.address && (
          <div><strong>Address:</strong> {project.address}</div>
        )}
      </div>

      {/* ROOMS */}
      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          project={project}
          calculateRoom={calculateRoom}
          exportMode
          onUpdateRoom={() => {}}
          onRemoveRoom={() => {}}
        />
      ))}

      {/* SUMMARY */}
      <SummaryCard project={project} summary={summary} />
    </div>
  );
});
