import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectSettings, RoomInput } from "../models/projectTypes";
import { ProjectCard } from "../components/projects/ProjectCard";
import { ProjectEditor } from "../components/projects/ProjectEditor";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { useNavigate, useParams } from "react-router-dom";
import { fetchAllProjects, RichProject } from "../services/firebaseHelpers";
import { uid } from "../utils/uid";
import { AppLayout } from "../components/layout/AppLayout";
import Skeleton from "@mui/material/Skeleton"; // 👈 MUI Skeleton
import { Search, X, ChevronDown } from "lucide-react";
import {
  DashboardQuery,
  DEFAULT_DASHBOARD_QUERY,
  RegionFilter,
  SortOption,
  StatusFilter,
  isDashboardQueryActive,
  queryProjects,
  sortProjects,
} from "../utils/projectDashboardQuery";

const STATUS_FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
];

const REGION_FILTER_OPTIONS: { key: RegionFilter; label: string }[] = [
  { key: "all", label: "All Regions" },
  { key: "UK", label: "UK" },
  { key: "EU", label: "EU" },
  { key: "US", label: "US" },
  { key: "CA", label: "Canada" },
];

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "updated_desc", label: "Recently Updated" },
  { key: "created_desc", label: "Recently Created" },
  { key: "name_asc", label: "Project Name A–Z" },
  { key: "name_desc", label: "Project Name Z–A" },
];

const PAGE_SIZE = 24;
// Shared height/text sizing so every toolbar control — input, buttons,
// selects — lines up pixel-for-pixel instead of relying on each element's
// own default sizing.
const TOOLBAR_CONTROL_CLASS = "h-9 text-sm";

/**
 * Renders up to PAGE_SIZE cards at a time with a "Show more" button —
 * keeps the DOM small regardless of how many projects match, which
 * matters once a user has hundreds of them. Give this a `key` tied to
 * whatever changed the underlying `items` (a filter, a sort, a section
 * switch) so pagination resets to the top instead of preserving a
 * visible-count that no longer means the same thing.
 */
function PagedProjectGrid({
  items,
  onOpen,
}: {
  items: RichProject[];
  onOpen: (id: string) => void;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = items.slice(0, visible);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {shown.map((proj) => (
          <ProjectCard key={proj.id} project={proj} onClick={onOpen} />
        ))}
      </div>
      {visible < items.length && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="px-4 py-2 text-sm font-medium rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
          >
            Show {Math.min(PAGE_SIZE, items.length - visible)} more (of {items.length})
          </button>
        </div>
      )}
    </>
  );
}

/** Section heading with a color dot matching the same status's card badge — lets the two sections be told apart at a glance, not just by reading the label. */
function SectionHeading({
  label,
  count,
  dotClass,
}: {
  label: string;
  count: number;
  dotClass: string;
}) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
      <span className="font-normal text-slate-400">{count}</span>
    </h3>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/60 py-10 px-6 text-center">
      <h4 className="text-sm font-semibold text-slate-700 mb-1">{title}</h4>
      <p className="text-sm text-slate-500 max-w-sm mb-4">{body}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-semibold rounded-md bg-[#1E3A8A] text-white hover:bg-[#17306f] transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Tailors the "no results" message to *why* the list is empty, instead of one generic message for every case. */
function emptyResultsMessage(query: DashboardQuery): { title: string; body: string } {
  const search = query.search.trim();
  if (search) {
    return {
      title: "No matching projects",
      body: `Nothing matches "${search}". Try a different term or clear your filters.`,
    };
  }
  if (query.status !== "all") {
    return {
      title: query.status === "draft" ? "No draft projects" : "No published projects",
      body:
        query.status === "draft"
          ? "You don't have any draft projects right now."
          : "You don't have any published projects yet — finish and save a draft to publish it.",
    };
  }
  return {
    title: "No matching projects",
    body: "Try adjusting your filters to see more projects.",
  };
}

export default function HomePage() {
  const [projects, setProjects] = useState<RichProject[]>([]);
  const [loading, setLoading] = useState(true); // 👈 new
  const [activeProject, setActiveProject] = useState<RichProject | null>(null);
  const [query, setQuery] = useState<DashboardQuery>(DEFAULT_DASHBOARD_QUERY);
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

  // Stable across renders so ProjectCard's React.memo (see
  // components/projects/ProjectCard.tsx) is an actual optimization at
  // dashboard scale, not a no-op defeated by a fresh closure every render.
  const openProject = useCallback((id: string) => navigate(`/project/${id}`), [navigate]);

  const updateProject = (patch: Partial<ProjectSettings>) => {
    if (!activeProject) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProject.id ? { ...p, ...patch } : p)),
    );
    setActiveProject((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  // Mirrors ProjectPage.tsx#addRoom's defaults — this whole activeProject
  // branch is currently unreachable (no /dashboard/:id route exists, see
  // docs/AUDIT_REPORT.md H2), but ProjectEditor now requires onAddRoom, so
  // this keeps the branch internally consistent rather than a bare no-op.
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
      setpointC: 21,
      joistSpacing: 16,
      floorCover: "tile_stone",
      installMethod: "DRILLING",
      floorOnGround: false,
    };
    const updatedRooms = [...activeProject.rooms, newRoom];
    setActiveProject({ ...activeProject, rooms: updatedRooms });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, rooms: updatedRooms } : p,
      ),
    );
  };

  const updateRoom = (id: string, patch: Partial<RoomInput>) => {
    if (!activeProject) return;
    const updatedRooms = activeProject.rooms.map((r) =>
      r.id === id ? { ...r, ...patch } : r,
    );
    setActiveProject({ ...activeProject, rooms: updatedRooms });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, rooms: updatedRooms } : p,
      ),
    );
  };

  const removeRoom = (id: string) => {
    if (!activeProject) return;
    const updatedRooms = activeProject.rooms.filter((r) => r.id !== id);
    setActiveProject({ ...activeProject, rooms: updatedRooms });
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...p, rooms: updatedRooms } : p,
      ),
    );
  };

  const summary = useProjectSummary(
    activeProject?.rooms || [],
    activeProject || undefined,
  );

  // Single source of truth for search/filter/sort — see
  // src/utils/projectDashboardQuery.ts. Memoized: with hundreds of
  // projects this filtering work should only re-run when the project
  // list or the query itself actually changes, not on every render.
  //
  // No separate "Recent Projects" bucket: every project shown there would
  // necessarily also appear again in Published or Draft below (recency is
  // already the default sort), which was pure duplication on screen. The
  // top of each section already surfaces what's recent.
  const isFiltering = useMemo(() => isDashboardQueryActive(query), [query]);
  const filteredResults = useMemo(() => queryProjects(projects, query), [projects, query]);
  const published = useMemo(
    () => sortProjects(projects.filter((p) => (p.status ?? "draft") === "published"), query.sort),
    [projects, query.sort],
  );
  const drafts = useMemo(
    () => sortProjects(projects.filter((p) => (p.status ?? "draft") !== "published"), query.sort),
    [projects, query.sort],
  );

  const clearFilters = () => setQuery(DEFAULT_DASHBOARD_QUERY);
  const queryFingerprint = `${query.search}|${query.status}|${query.region}|${query.sort}`;
  const emptyResults = useMemo(() => emptyResultsMessage(query), [query]);

  // 👇 Skeleton grid component — same responsive columns as the real
  // grid so loading -> loaded doesn't visibly reflow.
  const ProjectSkeletons = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {[...Array(9)].map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-white p-0 shadow-sm ring-1 ring-gray-200"
        >
          <Skeleton
            variant="rectangular"
            height={112}
            sx={{ borderRadius: "8px" }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-100 text-slate-800 font-sans">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
                onRemoveRoom={removeRoom}
                onAddRoom={addRoom}
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
              {/* Sticky page header + unified toolbar */}
              <div className="sticky top-[64px] z-30 -mx-4 mb-4 bg-gray-100 px-4 pb-2 pt-1 sm:-mx-6 sm:px-6">
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h2>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {projects.length}
                    </span>
                  </div>

                  <button
                    onClick={addProject}
                    className={`${TOOLBAR_CONTROL_CLASS} inline-flex items-center justify-center gap-2 rounded-lg px-4 font-semibold shadow-sm transition-all active:scale-[0.98] bg-[#1E3A8A] text-white hover:bg-[#17306f] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/30`}
                  >
                    + New Project
                  </button>
                </div>

                {/* One unified, always-single-row control bar. No control
                    carries its own border — a single outer border plus
                    thin dividers between logical groups (search | status |
                    region | sort) reads as one connected system instead of
                    four separate boxed widgets. Search is capped (not
                    flex-1-unbounded) so it can't dominate the row and
                    squeeze the filters into wrapping onto their own
                    stacked lines. */}
                <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm sm:flex-row sm:items-center sm:gap-0">
                  <div className="relative w-full sm:max-w-[200px] md:max-w-[260px]">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={query.search}
                      onChange={(e) =>
                        setQuery((q) => ({ ...q, search: e.target.value }))
                      }
                      placeholder="Search projects…"
                      aria-label="Search projects"
                      className={`${TOOLBAR_CONTROL_CLASS} w-full rounded-md border-0 pl-7 pr-6 focus:outline-none focus:ring-1 focus:ring-slate-300`}
                    />
                    {query.search && (
                      <button
                        onClick={() => setQuery((q) => ({ ...q, search: "" }))}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto sm:gap-2 sm:border-l sm:border-slate-200 sm:pl-2">
                    <div
                      role="group"
                      aria-label="Filter by status"
                      className={`${TOOLBAR_CONTROL_CLASS} flex shrink-0 items-center gap-0.5 rounded-md bg-slate-100 p-0.5`}
                    >
                      {STATUS_FILTER_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setQuery((q) => ({ ...q, status: opt.key }))}
                          aria-pressed={query.status === opt.key}
                          className={`h-full rounded px-2.5 font-medium transition-colors ${
                            query.status === opt.key
                              ? "bg-[#1E3A8A] text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative shrink-0">
                      <select
                        value={query.region}
                        onChange={(e) =>
                          setQuery((q) => ({ ...q, region: e.target.value as RegionFilter }))
                        }
                        aria-label="Filter by region"
                        className={`${TOOLBAR_CONTROL_CLASS} w-auto appearance-none rounded-md bg-transparent py-0 pl-2 pr-5 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-300`}
                      >
                        {REGION_FILTER_OPTIONS.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                    </div>

                    <div className="relative shrink-0">
                      <select
                        value={query.sort}
                        onChange={(e) =>
                          setQuery((q) => ({ ...q, sort: e.target.value as SortOption }))
                        }
                        aria-label="Sort projects"
                        className={`${TOOLBAR_CONTROL_CLASS} w-auto appearance-none rounded-md bg-transparent py-0 pl-2 pr-5 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-300`}
                      >
                        {SORT_OPTIONS.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {isFiltering ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {filteredResults.length} of {projects.length} projects match
                    </span>
                    <button
                      onClick={clearFilters}
                      className="font-medium text-teal-600 hover:text-teal-700"
                    >
                      Clear filters
                    </button>
                  </div>

                  {filteredResults.length === 0 ? (
                    <EmptyState
                      title={emptyResults.title}
                      body={emptyResults.body}
                      action={{ label: "Clear filters", onClick: clearFilters }}
                    />
                  ) : (
                    <PagedProjectGrid
                      key={queryFingerprint}
                      items={filteredResults}
                      onOpen={openProject}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <SectionHeading label="Published" count={published.length} dotClass="bg-emerald-500" />
                    {published.length === 0 ? (
                      <EmptyState
                        title="No published projects yet"
                        body="Finish and save a draft to publish it — published projects require complete, valid data."
                      />
                    ) : (
                      <PagedProjectGrid
                        key={`published-${query.sort}`}
                        items={published}
                        onOpen={openProject}
                      />
                    )}
                  </div>

                  <div>
                    <SectionHeading label="Drafts" count={drafts.length} dotClass="bg-amber-500" />
                    {drafts.length === 0 ? (
                      <EmptyState
                        title="No drafts in progress"
                        body="Start a new project — it's saved as a draft automatically as you go."
                        action={{ label: "+ New Project", onClick: addProject }}
                      />
                    ) : (
                      <PagedProjectGrid
                        key={`drafts-${query.sort}`}
                        items={drafts}
                        onOpen={openProject}
                      />
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
