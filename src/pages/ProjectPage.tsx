import React, { useEffect, useState } from "react";
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
import { exportPDF } from "../utils/pdfExport";
import { getDefaultUValues } from "../utils/uDefaults";

export default function ProjectPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [project, setProject] = useState<
    (ProjectSettings & { rooms: RoomInput[] }) | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showMessage } = useSnackbar();
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);

  // 🧩 Load project or create a new one
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
          unitMode: "metric",
          region: "UK",
          standardsMode: "BS_EN_12831",
          insulationPeriod: "y2001_2015",
          indoorTempC: 21,
          outdoorTempC: -10,
          safetyFactorPct: 12.5,
          heatUpFactorPct: 27.5,
          psiAllowance_W_per_K: 0.04,
          mechVent_m3_per_h: 0.4,
          infiltrationACH: 0.25,
          floorOnGround: true,
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".actions-dropdown")) {
        setShowActionsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateProject = (patch: Partial<ProjectSettings>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  };

  // ➕ Add Room
  const addRoom = () => {
    if (!project) return;

    const newRoom: RoomInput = {
      id: "",
      name: `Room ${project.rooms.length + 1}`,
      length_m: 0,
      width_m: 0,
      height_m: 0,
      exteriorLen_m: 0,
      windowArea_m2: 0,
      doorArea_m2: 0,
      ceilingExposed: false,
      floorExposed: false,
      setpointC: 0, // Default indoor setpoint temperature (°C)
      joistSpacing: "16in_400mm", // Default joist spacing
      floorCover: "tile_stone", // Default floor type
      installMethod: "drilled", // Default install method
    };

    setProject({ ...project, rooms: [...project.rooms, newRoom] });
  };

  const updateRoom = (roomName: string, patch: Partial<RoomInput>) => {
    if (!project) return;
    const updatedRooms = project.rooms.map((r) =>
      r.name === roomName ? { ...r, ...patch } : r
    );
    setProject({ ...project, rooms: updatedRooms });
  };

  const removeRoom = (roomName: string) => {
    if (!project) return;
    const updatedRooms = project.rooms.filter((r) => r.name !== roomName);
    setProject({ ...project, rooms: updatedRooms });
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
    setShowActionsDropdown(false);
  };

  const summary: ProjectSummary | null = useProjectSummary(
    project?.rooms || [],
    project || undefined
  );

  const handleSaveProject = async () => {
    if (!project) return;
    try {
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

      setIsSaving(true);
      await saveProjectTodb(project, showMessage);
      setIsSaving(false);
      showMessage("Project saved successfully.", "success");
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
    <AppLayout
      title="Ultra-Calc"
      subtitle="Room-by-room heat loss calculation and project management for HVAC professionals."
    >
      <main className="p-4 sm:p-4 max-w-7xl mx-auto min-h-screen bg-white">
        {/* Toolbar: Back + Units + Save/Delete */}
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between 
      gap-4 sm:gap-6 mb-6 bg-white border-b border-slate-100 pb-4 sm:pb-0"
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
            <div className="w-full flex justify-end sm:justify-end items-center">
              <span className="text-xs text-slate-500">Units :</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 m-2 shadow-sm">
                <button
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                    project.unitMode === "metric"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                  onClick={() => updateProject({ unitMode: "metric" })}
                >
                  Metric
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                    project.unitMode === "imperial"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                  onClick={() => updateProject({ unitMode: "imperial" })}
                >
                  Imperial
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Actions */}
          <div className="flex flex-row justify-end items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
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

            <div className="relative inline-block text-left actions-dropdown">
              <button
                onClick={() => setShowActionsDropdown((prev) => !prev)}
                className="inline-flex justify-center items-center gap-2 px-5 py-2.5 
      rounded-lg text-sm font-semibold 
      bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors
      focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30"
              >
                Actions ▾
              </button>

              {showActionsDropdown && (
                <div className="absolute right-0 mt-2 w-48 origin-top-right bg-white border border-slate-200 rounded-md shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        exportPDF(project);
                        setShowActionsDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Export PDF
                    </button>
                    {project.id && (
                      <button
                        onClick={handleDeleteClick}
                        className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Project Editor */}
        <div className="w-full overflow-x-auto">
          <ProjectEditor
            project={project}
            rooms={project.rooms}
            onUpdateProject={updateProject}
            onUpdateRoom={updateRoom}
            onAddRoom={addRoom}
            onRemoveRoom={removeRoom}
            summary={summary}
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
            const success = await deleteProjectFromDb(project.id, showMessage);
            setShowDeleteDialog(false);
            if (success) navigate("/");
          }}
        />
      )}
    </AppLayout>
  );
}
