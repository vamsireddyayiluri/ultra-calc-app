// src/components/export/RoomDetailsExport.tsx
import React, { useEffect, useState } from "react";
import { RoomCard } from "../rooms/RoomCard";
import { calculateRoom } from "../../utils/physics";
import { ProjectSettings, RoomInput } from "../../models/projectTypes";
import { loadImageAsBase64 } from "../../utils/pdfExport";

interface Props {
  room: RoomInput;
  project: ProjectSettings;
}

export const RoomDetailsExport = React.forwardRef<HTMLDivElement, Props>(
  ({ room, project }, ref) => {
    const [logoBase64, setLogoBase64] = useState<string | null>(null);

    useEffect(() => {
      const buildLogo = async () => {
        const base64 = await loadImageAsBase64("/assets/diagrams/logo.PNG");

        setLogoBase64(base64); // ✅ triggers re-render
      };

      buildLogo();
    }, []);
    console.log("Rendering RoomDetailsExport for room:", logoBase64);
    return (
      <div
        ref={ref}
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "16mm",
          background: "#ffffff",
        }}
      >
        {logoBase64 && (
          <div
            style={{
              textAlign: "center",
            }}
          >
            <img
              src={logoBase64}
              alt="UltraCalc"
              style={{
                maxWidth: "240px", // ✅ control width
                height: "auto", // ✅ keep aspect ratio
                objectFit: "contain",
              }}
            />
          </div>
        )}

        <RoomCard
          room={room}
          project={project}
          calculateRoom={calculateRoom}
          exportMode
          onUpdateRoom={() => {}}
          onRemoveRoom={() => {}}
        />
      </div>
    );
  },
);
