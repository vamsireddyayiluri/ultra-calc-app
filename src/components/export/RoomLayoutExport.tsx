// src/components/export/RoomLayoutExport.tsx
import React from "react";
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

const A4_CONTENT_WIDTH_MM = 182; // 210mm page - 14mm margins on both sides.
const LAYOUT_VISUAL_HEIGHT_MM = 222;
const SIDEBAR_WIDTH_MM = 34;
const DIAGRAM_SIDEBAR_GAP_MM = 6;
const LENGTH_LABEL_GUTTER_MM = 10;
const WIDTH_LABEL_GUTTER_MM = 9;
const ROOM_INFO_HEIGHT_MM = 17;
const DIAGRAM_MIN_SIDE_MM = 28;
const LENGTH_LABEL_GAP_MM = 4;

function getPdfDiagramSize(layout: ReturnType<typeof buildLayout>) {
  const diagramUnits = {
    width: Math.max(1, layout.width + 1),
    height: Math.max(1, layout.height + 1),
  };

  const availableWidth =
    A4_CONTENT_WIDTH_MM -
    SIDEBAR_WIDTH_MM -
    DIAGRAM_SIDEBAR_GAP_MM -
    LENGTH_LABEL_GUTTER_MM;
  const availableHeight = LAYOUT_VISUAL_HEIGHT_MM - WIDTH_LABEL_GUTTER_MM;

  const scale = Math.min(
    availableWidth / diagramUnits.width,
    availableHeight / diagramUnits.height,
  );

  return {
    widthMm: Math.max(DIAGRAM_MIN_SIDE_MM, diagramUnits.width * scale),
    heightMm: Math.max(DIAGRAM_MIN_SIDE_MM, diagramUnits.height * scale),
  };
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

    const diagramSize = getPdfDiagramSize(layout);
    const layoutBounds = {
      x: LENGTH_LABEL_GUTTER_MM,
      y: 0,
      width: diagramSize.widthMm,
      height: diagramSize.heightMm,
    };

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
            height: "100%",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "1 1 auto",
              minHeight: 0,
              marginBottom: "4mm",
            }}
          >
            {room.installMethod !== "INSLAB" ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  width: "100%",
                  height: `${LAYOUT_VISUAL_HEIGHT_MM}mm`,
                  maxHeight: "100%",
                  gap: `${DIAGRAM_SIDEBAR_GAP_MM}mm`,
                }}
              >
                <div
                  style={{
                    flex: "1 1 auto",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: `${
                        diagramSize.widthMm + LENGTH_LABEL_GUTTER_MM
                      }mm`,
                      height: `${
                        diagramSize.heightMm + WIDTH_LABEL_GUTTER_MM
                      }mm`,
                    }}
                  >
                  {/* Length */}
                  <div
                    style={{
                      position: "absolute",
                      left: `${layoutBounds.x - LENGTH_LABEL_GAP_MM}mm`,
                      top: `${layoutBounds.y + layoutBounds.height / 2}mm`,
                      transform: "translate(-50%, -50%) rotate(-90deg)",
                      transformOrigin: "center center",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#475569",
                      lineHeight: 1,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ← Joist Length →
                  </div>

                  <div
                    style={{
                      position: "absolute",
                      left: `${layoutBounds.x}mm`,
                      top: `${layoutBounds.y}mm`,
                      width: `${layoutBounds.width}mm`,
                      height: `${layoutBounds.height}mm`,
                    }}
                  >
                    <FloorLayoutSvg
                      layout={layout}
                      installMethod={room.installMethod}
                    />
                  </div>

                  {/* Width */}
                  <div
                    style={{
                      position: "absolute",
                      left: `${layoutBounds.x}mm`,
                      top: `${layoutBounds.y + layoutBounds.height + 4}mm`,
                      width: `${layoutBounds.width}mm`,
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#475569",
                      lineHeight: 1,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ← Width →
                  </div>
                </div>

                </div>

                <div
                  style={{
                    flex: `0 0 ${SIDEBAR_WIDTH_MM}mm`,
                    width: `${SIDEBAR_WIDTH_MM}mm`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-start",
                    paddingTop: "8mm",
                  }}
                >
                  <RightSidebar images={sidebarImages} />
                </div>
              </div>
            ) : (
              <RightSidebar images={sidebarImages} />
            )}
          </div>
          <div
            style={{
              flex: `0 0 ${ROOM_INFO_HEIGHT_MM}mm`,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.2 }}>
              {room.name}
            </div>

            <div style={{ fontSize: "15px", color: "#6b7280", lineHeight: 1.3 }}>
              {dimensionText}
            </div>
          </div>
        </div>
      </ReportPage>
    );
  },
);
