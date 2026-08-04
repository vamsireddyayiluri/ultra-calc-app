// src/components/export/RoomLayoutExport.tsx
import React from "react";
import { FloorLayoutSvg, SCALE } from "../../layout/FloorLayoutSvg";
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
import { ReportPage } from "./ReportPage";

interface Props {
  room: RoomInput;
  project: ProjectSettings;
  logoBase64: string | null;
  pageNumber: number;
  totalPages: number;
  /** Called once this page's async asset loading (layout tiles + sidebar images) has settled — whether it produced a usable diagram or not (e.g. an incomplete room). Used by the export-readiness gate in ProjectPage.tsx; omitted in any other usage (e.g. the unused ProjectExportView.tsx). */
  onReady?: () => void;
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
  ({ room, project, logoBase64, pageNumber, totalPages, onReady }, ref) => {
    const [layout, setLayout] = React.useState<ReturnType<
      typeof buildLayout
    > | null>(null);

    const [sidebarImages, setSidebarImages] =
      React.useState<SidebarImages | null>(null);

    // Readiness tracking for the export gate — deliberately independent
    // of whether `layout`/`sidebarImages` end up non-null. A room with
    // incomplete dimensions never produces a layout (see the early
    // return in the effect below); without this, the export gate would
    // wait forever for a signal that would never come. "Settled" means
    // "this effect has finished its attempt, successful or not."
    const layoutSettledRef = React.useRef(false);
    const sidebarSettledRef = React.useRef(false);
    const onReadyRef = React.useRef(onReady);
    onReadyRef.current = onReady;

    const maybeSignalReady = React.useCallback(() => {
      if (layoutSettledRef.current && sidebarSettledRef.current) {
        onReadyRef.current?.();
      }
    }, []);

    /* ---------------- CALC ---------------- */
    const displayLength = toDisplayLength(project.region, room.length_m);
    const displayWidth = toDisplayLength(project.region, room.width_m);
    const uiUnits = getUIUnits(project.region);
    const lenLabel = uiUnits.length;

    const dimensionText = `${displayLength} ${lenLabel} × ${displayWidth} ${lenLabel}`;

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
        if (!room.length_m || !room.width_m || !room.joistSpacing) {
          // Incomplete room — no layout will ever be produced for these
          // inputs. Still counts as "settled" so the export gate doesn't
          // wait forever; the page will render null and pdfExport.ts's
          // addPage() already skips a null ref.
          if (!cancelled) {
            layoutSettledRef.current = true;
            maybeSignalReady();
          }
          return;
        }

        const newLayout = buildLayout({
          roomLength_m: room.length_m,
          roomWidth_m: room.width_m,
          joist: room.joistSpacing,
          load: ultra.selection.mode === "LL" ? "LL" : "HL",
          method: ultra.selection.method,
        });

        // 🔹 INLINE + FLATTEN EACH TILE TO PNG FOR PDF
        // html2canvas serializes the outer <svg> (with every tile's
        // <image> child) into a single composite SVG-as-image resource
        // when rasterizing this "layout" page. Nested SVG-in-SVG-as-image
        // content isn't reliably painted through that path — verified
        // directly: the same tile SVG painted 100% of its pixels drawn
        // alone, but only ~6% once nested inside an outer svg-as-image.
        // Flattening each tile to a real PNG raster (via the same
        // svgBase64ToPng() RightSidebar's images already use) removes the
        // nesting entirely — a PNG data URI has no further nested
        // resources to resolve. Run in parallel since each tile's
        // inline+rasterize is independent of every other tile's.
        for (const tile of newLayout.tiles) {
          if (!tile.asset) continue;
          tile.assetBase64 = await inlineNestedSvgImages(tile.asset);
        }

        if (!cancelled) {
          setLayout(newLayout);
          layoutSettledRef.current = true;
          maybeSignalReady();
        }
      };

      build();
      return () => {
        cancelled = true;
      };
      // onReady/maybeSignalReady are intentionally omitted — maybeSignalReady
      // is a stable identity (see useCallback with [] deps) that always reads
      // the latest onReady via onReadyRef, so it doesn't need to be a dependency.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
          sidebarSettledRef.current = true;
          maybeSignalReady();
        }
      };

      buildSidebar();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.installMethod, room.joistSpacing]);

    /* ---------------- WAIT UNTIL READY ---------------- */
    if (!layout || !sidebarImages) return null;

    /* ---------------- RENDER ---------------- */
    return (
      <ReportPage
        ref={ref}
        logoBase64={logoBase64}
        projectName={project.name}
        pageLabel={`${room.name || "Unnamed room"} — Layout`}
        pageNumber={pageNumber}
        totalPages={totalPages}
      >
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
                <div
                  style={{
                    flex: 1,
                    position: "relative",
                    paddingLeft: "34px",
                    paddingBottom: "32px",
                  }}
                >
                  {/* Length */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%) rotate(-90deg)",
                      transformOrigin: "left center",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "#475569",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ← Length →
                  </div>

                  <FloorLayoutSvg
                    layout={layout}
                    installMethod={room.installMethod}
                  />

                  {/* Width */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "#475569",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ← Width →
                  </div>
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
      </ReportPage>
    );
  },
);
