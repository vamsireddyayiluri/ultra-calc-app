// src/components/export/ProjectExportView.tsx
import React from "react";
import { RoomDetailsExport } from "./RoomDetailsExport";
import { RoomLayoutExport } from "./RoomLayoutExport";
import { SummaryCard } from "../summary/SummaryCard";
import type {
  ProjectSettings,
  RoomInput,
  ProjectSummary,
} from "../../models/projectTypes";

interface Props {
  project: ProjectSettings;
  rooms: RoomInput[];
  summary: ProjectSummary | null;
}

export const ProjectExportView = React.forwardRef<HTMLDivElement, Props>(
  ({ project, rooms, summary }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: "-99999px",
          top: 0,
          width: "210mm",
          background: "#fff",
        }}
      >
        {/* LOGO + PROJECT HEADER (FIRST PAGE OPTIONAL) */}
        <div style={{ padding: "12mm" }}>
          <div style={{ textAlign: "center", marginBottom: "8mm" }}>
            <img src="/logo.png" height={40} />
          </div>

          <div style={{ fontSize: 12 }}>
            <div><strong>Project:</strong> {project.name}</div>
            <div><strong>Region:</strong> {project.region}</div>
            {project.address && (
              <div><strong>Address:</strong> {project.address}</div>
            )}
          </div>
        </div>

        {/* ROOMS */}
        {rooms.map((room) => (
          <React.Fragment key={room.id}>
            {/* PAGE 1 — ROOM DETAILS */}
            <RoomDetailsExport
              room={room}
              project={project}
            />

            {/* PAGE 2 — ROOM LAYOUT */}
            <RoomLayoutExport
              room={room}
              project={project}
            />
          </React.Fragment>
        ))}

        {/* FINAL PAGE — SUMMARY */}
        {summary && (
          <div
            style={{
              width: "210mm",
              height: "297mm",
              padding: "12mm",
              boxSizing: "border-box",
            }}
          >
            <SummaryCard project={project} summary={summary} />
          </div>
        )}
      </div>
    );
  }
);
