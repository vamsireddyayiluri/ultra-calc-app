import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uid } from "../utils/uid";
import { ProjectHeader, Room } from "../models/projectTypes";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { ProjectEditor } from "../components/projects/ProjectEditor";
import { AppLayout } from "../components/layout/AppLayout";
import { toRichRoom } from "../helpers/updateRoomModel";
import {
  deleteProjectFromDb,
  fetchProjectById,
  saveProjectTodb,
} from "../services/firebaseHelpers";
import { ShowChart } from "@mui/icons-material";
import { useSnackbar } from "../contexts/SnackbarProvider";
import { ConfirmDialog } from "../components/layout/ConfirmDialog";
import { CircularProgress } from "@mui/material";
import { projectSchema } from "../validations.ts/projectSchema";
import z from "zod";
import { roomSchema } from "../validations.ts/roomSchema";
import { exportPDF } from "../utils/pdfExport";
import { exportCSV } from "../utils/csvExport";

export default function ProjectPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [projects, setProjects] = useState<
    (ProjectHeader & { rooms: Room[] })[]
  >([]);
  const [project, setProject] = useState<
    (ProjectHeader & { rooms: Room[] }) | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showMessage } = useSnackbar();
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);

  // Load project or create a new one
  useEffect(() => {
    const fetchData = async () => {
      if (id) {
        const found = await fetchProjectById(id); // Assume this function fetches a project by ID
        setProject(found || null);
      } else {
        const newProj: ProjectHeader & { rooms: Room[] } = {
          name: "New Project",
          contractor: "Contractor Name",
          address: "",
          designIndoorC: 21,
          designOutdoorC: -10,
          period: "y2001_2015",
          units: "metric",
          region: "UK",
          standardsMode: "BS_EN_12831",
          safetyFactorPct: 12.5,
          heatUpFactorPct: 27.5,
          psiAllowance_W_per_K: 0.04,
          mechVent_m3_per_h: 0.4,
          infiltrationACH: 0.25,
          floorOnGround: true,
          rooms: [],
        };
        setProject(newProj);
      }
    };

    fetchData();
  }, [id, projects]);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".actions-dropdown")) {
        setShowActionsDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const updateProject = (patch: Partial<ProjectHeader>) => {
    if (!project) return;
    console.log("Updating project with patch:", patch, {
      ...project,
      ...patch,
    });
    setProject({ ...project, ...patch });
  };

  const addRoom = () => {
    if (!project) return;
    const newRoom: Room = {
      id: uid(),
      name: `Room ${project.rooms.length + 1}`,
      length_m: 4,
      width_m: 3,
      height_m: 2.5,
      exteriorLen_m: 4,
      windowArea_m2: 1,
      doorArea_m2: 0,
      ceilingExposed: false,
      floorExposed: false,
      method: "drilled",
    };
    setProject({ ...project, rooms: [...project.rooms, newRoom] });
  };

  const updateRoom = (roomId: string, patch: Partial<Room>) => {
    if (!project) return;
    const updatedRooms = project.rooms.map((r) =>
      r.id === roomId ? { ...r, ...patch } : r
    );
    setProject({ ...project, rooms: updatedRooms });
  };

  const removeRoom = (roomId: string) => {
    if (!project) return;
    const updatedRooms = project.rooms.filter((r) => r.id !== roomId);
    setProject({ ...project, rooms: updatedRooms });
  };

  const summary = useProjectSummary(
    project?.rooms || [],
    project || projects[0]
  );

  // 🧠 Handle Save Logic here
  const handleSaveProject = async () => {
    try {
      // ✅ Validate project
      projectSchema.parse(project);

      // ✅ Validate all rooms
      project.rooms.forEach((room, index) => {
        try {
          roomSchema.parse(room);
        } catch (err) {
          if (err instanceof z.ZodError) {
            throw new Error(
              `Room ${index + 1}: ${
                err.issues?.[0]?.message ?? "Validation error"
              }`
            );
          }
        }
      });

      setIsSaving(true);
      await saveProjectTodb(project, showMessage);
      setIsSaving(false);
    } catch (err) {
      setIsSaving(false);

      if (err instanceof z.ZodError) {
        showMessage(err.issues?.[0]?.message ?? "Validation failed", "error");
        console.warn("Validation failed:", err.issues);
        return;
      }

      // ✅ Handle normal errors (like our custom "Room X: ..." ones)
      if (err instanceof Error) {
        showMessage(err.message, "error");
        console.warn("Validation failed:", err.message);
        return;
      }

      console.error("Unexpected error:", err);
      showMessage("Something went wrong while saving.", "error");
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
          {/* LEFT SIDE: Back + Units */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            {/* Back Button */}
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 
    rounded-lg text-sm font-medium bg-slate-100 text-slate-700 
    hover:bg-slate-200 transition-colors 
    whitespace-nowrap min-w-fit
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
                    project.units === "metric"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                  onClick={() => updateProject({ units: "metric" })}
                >
                  Metric
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                    project.units === "imperial"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                  onClick={() => updateProject({ units: "imperial" })}
                >
                  Imperial
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Actions */}
          <div className="flex flex-row justify-end items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
            {/* Save */}
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

            {/* Actions Dropdown */}
            <div className="relative inline-block text-left">
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
                        exportCSV(project);
                        setShowActionsDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Export CSV
                    </button>
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
                        onClick={() => {
                          setShowDeleteDialog(true);
                          setShowActionsDropdown(false);
                        }}
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

        {/* Main Editor Card */}
        <div className="w-full overflow-x-auto">
          <ProjectEditor
            project={project}
            rooms={project.rooms || []}
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
            if (success) navigate("/"); // go back to dashboard
          }}
        />
      )}
    </AppLayout>
  );
}
