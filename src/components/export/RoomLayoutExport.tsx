// src/components/export/RoomLayoutExport.tsx
import React, { useEffect, useState } from "react";
import { FloorLayoutSvg } from "../../layout/FloorLayoutSvg";
import { RightSidebar } from "../../layout/RightSidebar";
import { buildLayout } from "../../layout/layoutEngine";
import { runUltraCalc } from "../../utils/ultraCalcAdapter";
import { calculateRoom } from "../../utils/physics";
import {
  RoomInput,
  ProjectSettings,
  InstallMethod,
} from "../../models/projectTypes";
import { resolveSidebarAssets } from "../../layout/sidebarResolver";
import {
  inlineNestedSvgImages,
  loadImageAsBase64,
  svgBase64ToPng,
} from "../../utils/pdfExport";
import { toDisplayLength } from "../../utils/display";
import { getUIUnits } from "../../helpers/updateUiLabels";

interface Props {
  room: RoomInput;
  project: ProjectSettings;
}
interface SidebarImages {
  profiles: string[];
  supportIcon: string | null;
  joistLabel: string;
  label: string;
  isOpenWeb: boolean;
  installMethod?: InstallMethod;
}

export const RoomLayoutExport = React.forwardRef<HTMLDivElement, Props>(
  ({ room, project }, ref) => {
    const [layout, setLayout] = React.useState<ReturnType<
      typeof buildLayout
    > | null>(null);

    const [sidebarImages, setSidebarImages] =
      React.useState<SidebarImages | null>(null);
    /* ---------------- CALC ---------------- */
    const [logoBase64, setLogoBase64] = useState<string | null>(null);

    useEffect(() => {
      const buildLogo = async () => {
        const base64 = await loadImageAsBase64("/assets/diagrams/logo.PNG");

        setLogoBase64(base64); // ✅ triggers re-render
      };

      buildLogo();
    }, []);
    const displayLength = toDisplayLength(project.region, room.length_m);
    const displayWidth = toDisplayLength(project.region, room.width_m);
    const uiUnits = getUIUnits(project.region);
      const lenLabel = uiUnits.length;

    const dimensionText = `${displayLength} ${lenLabel} × ${displayWidth} ${lenLabel}`;

    console.log("Rendering RoomDetailsExport for room  :", room);

    const res = React.useMemo(
      () => calculateRoom(room, project),
      [room, project],
    );

    const ultra = React.useMemo(
      () => runUltraCalc(room, res, project),
      [room, res, project],
    );

    /* ---------------- BUILD LAYOUT (ASYNC) ---------------- */
    React.useEffect(() => {
      let cancelled = false;

      const build = async () => {
        if (!room.length_m || !room.width_m || !room.joistSpacing) return;

        const newLayout = buildLayout({
          roomLength_m: room.length_m,
          roomWidth_m: room.width_m,
          joist: room.joistSpacing,
          load: ultra.selection.mode === "LL" ? "LL" : "HL",
          method: ultra.selection.method,
        });

        // 🔹 INLINE SVGs FOR PDF
        for (const tile of newLayout.tiles) {
          if (!tile.asset) continue;
          tile.assetBase64 = await inlineNestedSvgImages(tile.asset);
        }

        if (!cancelled) {
          setLayout(newLayout);
        }
      };

      build();
      return () => {
        cancelled = true;
      };
    }, [
      room.length_m,
      room.width_m,
      room.joistSpacing,
      ultra.selection.mode,
      ultra.selection.method,
    ]);

    /* ---------------- BUILD SIDEBAR (ASYNC) ---------------- */
    React.useEffect(() => {
      let cancelled = false;

      const buildSidebar = async () => {
        const sidebar = resolveSidebarAssets(
          room.installMethod,
          room.joistSpacing!,
        );

        const isSvg = (s: string) => s.endsWith(".svg");

        const profiles = await Promise.all(
          sidebar.profiles.map(async (src) => {
            if (!src) return "";
            const svg = isSvg(src)
              ? await inlineNestedSvgImages(src)
              : await loadImageAsBase64(src);

            return await svgBase64ToPng(svg, 104, 64);
          }),
        );

        const supportIcon = sidebar.supportIcon
          ? await svgBase64ToPng(
              await inlineNestedSvgImages(sidebar.supportIcon),
              48,
              48,
            )
          : null;

        if (!cancelled) {
          setSidebarImages({
            profiles,
            supportIcon,
            joistLabel:
              room.installMethod === "INSLAB"
                ? ultra.selection.spacingDisplayText
                : sidebar.joistLabel,
            label: sidebar.label,
            isOpenWeb: sidebar.profiles.length === 2,
            installMethod: room.installMethod,
          });
        }
      };

      buildSidebar();
      return () => {
        cancelled = true;
      };
    }, [room.installMethod, room.joistSpacing]);

    /* ---------------- WAIT UNTIL READY ---------------- */
    if (!layout || !sidebarImages) return null;

    /* ---------------- RENDER ---------------- */
    return (
      <div
        ref={ref}
        style={{
          width: "210mm",
          height: "297mm",
          padding: "10mm 12mm 12mm 12mm",
          background: "#fff",
          boxSizing: "border-box",
          position: "relative", // IMPORTANT
          display: "flex",
          flexDirection: "column", // stack vertically
        }}
      >
        {logoBase64 && (
          <div
            style={{
              textAlign: "center",
              marginLeft: "24px",
            }}
          >
            <img
              src={logoBase64}
              alt="UltraCalc"
              style={{
                maxWidth: "240px",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>
        )}

        {/* MAIN CONTENT */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center", // center vertically
            justifyContent: "center",
            marginBottom: "6mm",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center", // center vertically
              justifyContent: "center",
              flex: 1, // take remaining space

              marginBottom: "6mm",
            }}
          >
            {room.installMethod !== "INSLAB" ? (
              <div style={{ display: "flex", width: "100%", height: "100%" }}>
                <div style={{ flex: 1 }}>
                  <FloorLayoutSvg
                    layout={layout}
                    installMethod={room.installMethod}
                  />
                </div>

                <RightSidebar images={sidebarImages} />
              </div>
            ) : (
              <RightSidebar images={sidebarImages} />
            )}
          </div>
          <div style={{ marginTop: "2px", textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: 600 }}>{room.name}</div>

            <div style={{ fontSize: "20px", color: "#6b7280" }}>
              {dimensionText}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
