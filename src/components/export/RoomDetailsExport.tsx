// src/components/export/RoomDetailsExport.tsx
import React from "react";
import { RoomCard } from "../rooms/RoomCard";
import { calculateRoom } from "../../utils/physics";
import { ProjectSettings, RoomInput } from "../../models/projectTypes";
import { ReportPage } from "./ReportPage";

interface Props {
  room: RoomInput;
  project: ProjectSettings;
  logoBase64: string | null;
  pageNumber: number;
  totalPages: number;
  /** Called once this page has mounted (and its ref is attached). RoomCard's exportMode never depends on its own async layout/sidebar state (that block is gated by `!exportMode`), so this page is ready as soon as it mounts. See src/utils/exportReadiness.ts. */
  onReady?: () => void;
}

export const RoomDetailsExport = React.forwardRef<HTMLDivElement, Props>(
  ({ room, project, logoBase64, pageNumber, totalPages, onReady }, ref) => {
    React.useEffect(() => {
      onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <ReportPage
        ref={ref}
        logoBase64={logoBase64}
        projectName={project.name}
        pageLabel={`${room.name || "Unnamed room"} — Details`}
        pageNumber={pageNumber}
        totalPages={totalPages}
      >
        <RoomCard
          room={room}
          project={project}
          calculateRoom={calculateRoom}
          exportMode
          onUpdateRoom={() => {}}
          onRemoveRoom={() => {}}
        />
      </ReportPage>
    );
  },
);
