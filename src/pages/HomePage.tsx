import React, { useEffect, useState } from "react";
import { ProjectSettings, RoomInput } from "../models/projectTypes";
import { ProjectCard } from "../components/projects/ProjectCard";
import { ProjectEditor } from "../components/projects/ProjectEditor";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useNavigate, useParams } from "react-router-dom";
import { fetchAllProjects, RichProject } from "../services/firebaseHelpers";
import { uid } from "../utils/uid";
import { AppLayout } from "../components/layout/AppLayout";
import Skeleton from "@mui/material/Skeleton"; // 👈 MUI Skeleton

export default function HomePage() {
  const [projects, setProjects] = useState<RichProject[]>([]);
  const [loading, setLoading] = useState(true); // 👈 new
  const [activeProject, setActiveProject] = useState<RichProject | null>(null);
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const allProjects = await fetchAllProjects();
        setProjects(allProjects);
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, []);

  useEffect(() => {
    if (params.id) {
      const proj = projects.find((p) => p.id === params.id);
      if (proj) setActiveProject(proj);
    } else {
      setActiveProject(null);
    }
  }, [params.id, projects]);

  const addProject = () => navigate("/project");

  const updateProject = (patch: Partial<ProjectSettings>) => {
    if (!activeProject) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProject.id ? { ...p, ...patch } : p))
    );
    setActiveProject((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateRoom = (id: string, patch: Partial<RoomInput>) => {
    if (!activeProject) return;
    const updatedRooms = activeProject.rooms.map((r) =>
      r.id === id ? { ...r, ...patch } : r
    );
    setActiveProject({ ...activeProject, rooms: updatedRooms });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, rooms: updatedRooms } : p
      )
    );
  };

  const addRoom = () => {
    if (!activeProject) return;
    const newRoom: RoomInput = {
      id: uid(),
      name: `Room ${activeProject.rooms.length + 1}`,
      length_m: 0,
      width_m: 0,
      height_m: 0,
      exteriorLen_m: 0,
      windowArea_m2: 0,
      doorArea_m2: 0,
      ceilingExposed: false,
      floorExposed: false,
      installMethod: "drilled",
      setpointC: 0,
      joistSpacing: "16in_400mm",
      floorCover: "tile_stone",
    };
    const updatedRooms = [...activeProject.rooms, newRoom];
    setActiveProject({ ...activeProject, rooms: updatedRooms });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, rooms: updatedRooms } : p
      )
    );
  };

  const removeRoom = (id: string) => {
    if (!activeProject) return;
    const updatedRooms = activeProject.rooms.filter((r) => r.id !== id);
    setActiveProject({ ...activeProject, rooms: updatedRooms });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, rooms: updatedRooms } : p
      )
    );
  };

  const summary = useProjectSummary(
    activeProject?.rooms || [],
    activeProject || undefined
  );

  // 👇 Skeleton grid component
  const ProjectSkeletons = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      {[...Array(9)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-[#FFF5E6] p-0 shadow-md ring-1 ring-gray-100"
        >
          <Skeleton
            variant="rectangular"
            height={180}
            sx={{ borderRadius: 2 }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#FFF8EE] text-slate-800 font-sans">
        <main className="mx-auto px-6 py-8 max-w-7xl bg-[#FFF8EE]">
          {activeProject ? (
            <section
              className="w-full rounded-xl p-5 bg-white shadow-md ring-1 ring-gray-100"
              aria-labelledby="project-editor"
            >
              <h2 id="project-editor" className="text-xl font-semibold mb-3">
                {activeProject.name}
              </h2>
              <ProjectEditor
                project={activeProject}
                rooms={activeProject.rooms}
                onUpdateProject={updateProject}
                onUpdateRoom={updateRoom}
                onAddRoom={addRoom}
                onRemoveRoom={removeRoom}
                summary={summary}
              />
            </section>
          ) : loading ? ( // 👈 Show skeleton while loading
            <ProjectSkeletons />
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 rounded-xl p-8 bg-gradient-to-b from-white to-[#FFE8C9] shadow-md ring-1 ring-gray-100 border border-gray-100">
              <h2 className="text-2xl font-semibold text-slate-800 mb-2">
                No projects created
              </h2>
              <p className="text-slate-500 max-w-xl text-center mb-6">
                Create your first project to get started — room-by-room heat
                loss, materials, and a clear summary for engineers and
                contractors.
              </p>
              <button
                onClick={() => navigate("/project")}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-shadow transition-colors duration-150 shadow-sm bg-[#1E3A8A] text-white hover:shadow-md hover:bg-[#17306f] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30"
              >
                + Add Project
              </button>
            </div>
          ) : (
            <section>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    Your Projects
                  </h2>
                  <p className="text-sm text-slate-500">
                    Select a project to open the detailed editor and results.
                  </p>
                </div>

                <div className="sm:flex items-center gap-3">
                  <button
                    onClick={addProject}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-shadow transition-colors duration-150 shadow-sm bg-[#22D3EE] text-[#042029] hover:bg-[#18c6dd] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30"
                  >
                    + New Project
                  </button>
                </div>
              </div>

              {loading ? (
                <ProjectSkeletons />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map((proj) => (
                    <div
                      key={proj.id}
                      className="rounded-xl bg-[#FFF5E6] p-0 shadow-md ring-1 ring-gray-100 transition-transform transform hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <ProjectCard
                        project={proj}
                        onClick={() => navigate(`/project/${proj.id}`)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
