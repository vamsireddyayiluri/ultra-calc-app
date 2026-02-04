import React, { useRef, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid } from "../utils/uid";
import {
  ProjectSettings,
  RoomInput,
  ProjectSummary,
} from "../models/projectTypes";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { ProjectEditor } from "../components/projects/ProjectEditor";
import { AppLayout } from "../components/layout/AppLayout";
import {
  deleteProjectFromDb,
  fetchProjectById,
  saveProjectTodb,
} from "../services/firebaseHelpers";
import { useSnackbar } from "../contexts/SnackbarProvider";
import { ConfirmDialog } from "../components/layout/ConfirmDialog";
import { CircularProgress } from "@mui/material";
import { projectSchema } from "../validations.ts/projectSchema";
import { roomSchema } from "../validations.ts/roomSchema";
import z from "zod";
import { exportPDF, loadImageAsBase64 } from "../utils/pdfExport";
import { getDefaultUValues } from "../utils/uDefaults";
import { RoomDetailsExport } from "../components/export/RoomDetailsExport";
import { RoomLayoutExport } from "../components/export/RoomLayoutExport";
import { SummaryCard } from "../components/summary/SummaryCard";
import { ProjectForm } from "../components/forms/ProjectForm";

export default function ProjectPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [project, setProject] = useState<
    (ProjectSettings & { rooms: RoomInput[] }) | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showMessage } = useSnackbar();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const detailRefs = useRef<HTMLDivElement[]>([]);
  const layoutRefs = useRef<HTMLDivElement[]>([]);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "rooms" | "summary">(
    "details",
  );

  useEffect(() => {
    const buildLogo = async () => {
      const base64 = await loadImageAsBase64("/assets/diagrams/logo.PNG");

      setLogoBase64(base64); // ✅ triggers re-render
    };

    buildLogo();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (id) {
        const found = await fetchProjectById(id);
        setProject(found || null);
      } else {
        const newProj: ProjectSettings & { rooms: RoomInput[] } = {
          id: uid(),
          name: "",
          contractor: "",
          address: "",
          region: "UK",
          standardsMode: "BS_EN_12831",
          insulationPeriod: "y2001_2015",
          indoorTempC: 21,
          outdoorTempC: null,
          safetyFactorPct: 12.5,
          heatUpFactorPct: 27.5,
          psiAllowance_W_per_K: 0.04,
          mechVent_m3_per_h: 0.4,
          infiltrationACH: 0.25,
          glazing: "double",
          rooms: [],
          customUOverrides: getDefaultUValues({
            region: "UK",
            standardsMode: "BS_EN_12831",
            insulationPeriod: "y2001_2015",
          }),
        };
        setProject(newProj);
      }
    };

    fetchData();
  }, [id]);

  const updateProject = (patch: Partial<ProjectSettings>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  };
  const handleExportPDF = async () => {
    try {
      handleSaveProject(false);
      setIsExporting(true);

      await exportPDF(
        headerRef.current,
        detailRefs.current,
        layoutRefs.current,
        summaryRef.current,
      );

      showMessage("PDF downloaded successfully!", "success");
    } catch (error) {
      console.error("PDF export failed:", error);

      showMessage("Failed to download PDF", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // ➕ Add Room
  const addRoom = () => {
    if (!project) return;

    const newRoom: RoomInput = {
      id: uid(),
      name: `Room ${project.rooms.length + 1}`,
      length_m: 0,
      width_m: 0,
      height_m: 0,
      exteriorLen_m: 0,
      windowArea_m2: 0,
      doorArea_m2: 0,
      ceilingExposed: false,
      floorExposed: false,
      setpointC: 21, // Default indoor setpoint temperature (°C)
      joistSpacing: 16, // Default joist spacing
      floorCover: "tile_stone", // Default floor type
      installMethod: "DRILLING", // Default install method
      floorOnGround: false,
    };
    setProject({ ...project, rooms: [...project.rooms, newRoom] });
    showMessage("Room Added", "success");
  };

  const updateRoom = (roomName: string, patch: Partial<RoomInput>) => {
    if (!project) return;
    const updatedRooms = project.rooms.map((r) =>
      r.name === roomName ? { ...r, ...patch } : r,
    );
    setProject({ ...project, rooms: updatedRooms });
  };

  const removeRoom = (roomName: string) => {
    if (!project) return;
    const updatedRooms = project.rooms.filter((r) => r.name !== roomName);
    setProject({ ...project, rooms: updatedRooms });
  };

  const summary: ProjectSummary | null = useProjectSummary(
    project?.rooms || [],
    project || undefined,
  );

  const handleSaveProject = async (
    arg?: boolean | React.MouseEvent<HTMLButtonElement>,
  ) => {
    // If called from button click → arg is event
    // If called manually → arg is boolean
    const showNotification = typeof arg === "boolean" ? arg : true;

    if (!project) return;

    try {
      setIsSaving(true);

      projectSchema.parse(project);

      project.rooms.forEach((room, index) => {
        try {
          roomSchema.parse(room);
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new Error(`Room ${index + 1}: ${err.issues?.[0]?.message}`);
          }
        }
      });

      await saveProjectTodb(project, showMessage);

      if (showNotification) {
        showMessage("Project saved successfully.", "success");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        showMessage(err.issues?.[0]?.message ?? "Validation failed", "error");
      } else if (err instanceof Error) {
        showMessage(err.message, "error");
      } else {
        showMessage("Something went wrong while saving.", "error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!project)
    return (
      <div className="flex h-screen items-center justify-center">
        <CircularProgress color="primary" size={48} thickness={4} />
      </div>
    );

  return (
    <>
      <AppLayout
        title="Ultra-Calc"
        subtitle="Room-by-room heat loss calculation and project management for HVAC professionals."
      >
        <main className="p-4 sm:p-4 max-w-7xl mx-auto min-h-screen bg-white">
          {/* Toolbar: Back + Units + Save/Delete */}
          <div
            className="
    fixed
    top-[64px] lg:top-[72px]
    left-4 right-4
    lg:left-[120px] lg:right-[120px]
    z-50 bg-white
    flex flex-col sm:flex-row sm:items-center sm:justify-between
    gap-4 sm:gap-6 border-b border-slate-100 px-4 py-2
    mx-auto
  "
          >
            {/* LEFT SIDE */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 
    rounded-lg text-sm font-medium bg-slate-100 text-slate-700 
    hover:bg-slate-200 transition-colors whitespace-nowrap min-w-fit
    focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30"
              >
                ← Back
              </button>

              {/* Units Switcher */}
            </div>

            {/* RIGHT SIDE: Actions */}
            <div className="flex flex-row justify-end items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
              {activeTab === "rooms" && (
                <button
                  onClick={addRoom}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
             bg-[#22D3EE] text-[#042029] hover:bg-[#18c6dd] transition-colors shadow-sm"
                >
                  + Add Room
                </button>
              )}

              <button
                onClick={handleSaveProject}
                disabled={isSaving}
                className={`inline-flex justify-center items-center gap-2 px-5 py-2.5 
      rounded-lg text-sm font-semibold
      ${isSaving ? "bg-gray-400" : "bg-[#1E3A8A] hover:bg-[#17306f]"} 
      text-white transition-colors shadow-sm
      focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30`}
              >
                {isSaving ? "Saving..." : "Save Project"}
              </button>
              {/* Export PDF */}
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className={`
    inline-flex items-center justify-center gap-2
    px-6 py-2.5 rounded-full
    text-sm font-semibold
    transition shadow-sm
    focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30
    ${
      isExporting
        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
    }
  `}
              >
                {isExporting ? "Exporting..." : "Export PDF"}
              </button>

              {/* Delete */}
              {project.id && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="inline-flex justify-center items-center gap-2 px-5 py-2.5 
      rounded-lg text-sm font-semibold 
      bg-red-50 text-red-700 hover:bg-red-100 transition-colors
      focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Project Editor */}
          <div className="w-full overflow-x-auto sm:mt-10">
            <ProjectEditor
              project={project}
              rooms={project.rooms}
              onUpdateProject={updateProject}
              onUpdateRoom={updateRoom}
              onRemoveRoom={removeRoom}
              summary={summary}
              onTabChange={(tab) => setActiveTab(tab)} // ✅
            />
          </div>
        </main>

        {showDeleteDialog && (
          <ConfirmDialog
            title="Delete Project"
            message="Are you sure you want to permanently delete this project?"
            confirmText="Delete"
            cancelText="Cancel"
            onCancel={() => setShowDeleteDialog(false)}
            onConfirm={async () => {
              if (!project?.id) return;
              const success = await deleteProjectFromDb(
                project.id,
                showMessage,
              );
              setShowDeleteDialog(false);
              if (success) navigate("/");
            }}
          />
        )}
      </AppLayout>
      {/* Hidden Export View for PDF */}
      <div style={{ position: "absolute", left: "-99999px", top: 0 }}>
        {/* ───────────── HEADER PAGE ───────────── */}
        <div
          ref={headerRef}
          style={{
            width: "210mm",
            height: "297mm",
            padding: "12mm",
            boxSizing: "border-box",
            background: "#fff",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "8mm" }}>
            <img src="/logo.png" height={40} />
          </div>

          <div style={{ fontSize: 12 }}>
            <div>
              <strong>Project:</strong> {project.name}
            </div>
            <div>
              <strong>Region:</strong> {project.region}
            </div>
            {project.address && (
              <div>
                <strong>Address:</strong> {project.address}
              </div>
            )}
          </div>
        </div>

        {/* ───────────── PER ROOM ───────────── */}
        {project.rooms.map((room, i) => (
          <React.Fragment key={room.id}>
            <div
              ref={(el) => (detailRefs.current[i] = el!)}
              style={{
                width: "210mm",
                height: "297mm",
                background: "#fff",
              }}
            >
              <RoomDetailsExport room={room} project={project} />
            </div>

            <div
              ref={(el) => (layoutRefs.current[i] = el!)}
              style={{
                width: "210mm",
                height: "297mm",
                background: "#fff",
              }}
            >
              <RoomLayoutExport room={room} project={project} />
            </div>
          </React.Fragment>
        ))}

        {/* ───────────── SUMMARY ───────────── */}
        {summary && (
          <div
            ref={summaryRef}
            style={{
              width: "210mm",
              height: "297mm",
              padding: "12mm",
              boxSizing: "border-box",
              background: "#fff",
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
                    maxWidth: "240px",
                    height: "auto",
                    objectFit: "contain",
                  }}
                />
              </div>
            )}
            <ProjectForm project={project} onUpdate={() => {}} exportMode />
            <div style={{ height: "16px" }}></div>
            <SummaryCard project={project} summary={summary} />
          </div>
        )}
      </div>
    </>
  );
}
