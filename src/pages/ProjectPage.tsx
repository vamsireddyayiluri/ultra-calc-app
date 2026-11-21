import React, { useMemo, useRef, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileUp, Trash2 } from "lucide-react";
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
  saveDraftToDb,
  publishProjectToDb,
} from "../services/firebaseHelpers";
import { useSnackbar } from "../contexts/SnackbarProvider";
import { ConfirmDialog } from "../components/layout/ConfirmDialog";
import { CircularProgress } from "@mui/material";
import { validateProject } from "../validations.ts/projectValidator";
import { getFriendlySaveErrorMessage } from "../utils/friendlyError";
import { exportPDF, loadImageAsBase64 } from "../utils/pdfExport";
import { createReadinessGate } from "../utils/exportReadiness";
import { createDraftProject, createEmptyRoom, ensureRoomIds } from "../utils/projectFactory";
import { RoomDetailsExport } from "../components/export/RoomDetailsExport";
import { RoomLayoutExport } from "../components/export/RoomLayoutExport";
import { CoverPage } from "../components/export/CoverPage";
import { DesignParametersPage } from "../components/export/DesignParametersPage";
import { MaterialsSummaryPage } from "../components/export/MaterialsSummaryPage";

export default function ProjectPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [project, setProject] = useState<
    (ProjectSettings & { rooms: RoomInput[] }) | null
  >(null);
  // Bumped ONLY by user-initiated edits (updateProject/addRoom/updateRoom/
  // removeRoom below) - never by syncing persistence metadata (id, revision,
  // status) back from a completed Firestore save. The autosave effect keys
  // off this instead of `project` itself: `persistDraftIfEditable` merges the
  // new `revision` Firestore just returned into `project`, which previously
  // re-triggered that same effect (since it depended on `project`), which
  // saved again, which bumped `revision` again, forever - an infinite
  // autosave loop that never needed a single further user edit to continue.
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { showMessage } = useSnackbar();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const designParamsRef = useRef<HTMLDivElement | null>(null);
  const detailRefs = useRef<HTMLDivElement[]>([]);
  const layoutRefs = useRef<HTMLDivElement[]>([]);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Deterministic, timer-free "has every hidden export page actually
  // finished rendering" gate — see src/utils/exportReadiness.ts. Lazily
  // created once (not on every render) via the standard useRef-null-check
  // pattern, since it holds mutable readiness state across the page's
  // whole lifetime, not just one render.
  const readinessGateRef = useRef<ReturnType<
    typeof createReadinessGate
  > | null>(null);
  if (!readinessGateRef.current) {
    readinessGateRef.current = createReadinessGate();
  }
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
        // Legacy Firestore rooms saved before `RoomInput.id` existed may lack
        // it; backfill a stable id here (once, on load) so every room has an
        // immutable identity before updateRoom/removeRoom below ever run -
        // otherwise two same-named rooms (e.g. "BEDROOM" on different
        // floors) could be matched and edited/deleted by name collision.
        setProject(found ? { ...found, rooms: ensureRoomIds(found.rooms) } : null);
      } else {
        setProject(createDraftProject());
      }
    };

    fetchData();
  }, [id]);

  const updateProject = (patch: Partial<ProjectSettings>) => {
    setProject((prev) => ({ ...prev, ...patch }));
    setDirtyVersion((v) => v + 1);
  };

  // Draft-safe, silent persistence — never validates, never touches a
  // Published project (per the lifecycle rules: no automatic Firestore
  // saves once published). Shared by the autosave effect and the
  // pre-export save below so the "when is it safe to silently persist"
  // rule only lives in one place.
  const persistDraftIfEditable = async (
    proj: ProjectSettings & { rooms: RoomInput[] },
  ) => {
    if (proj.status === "published") return;
    try {
      const saved = await saveDraftToDb(proj);
      // Keep local state in sync with what Firestore now has - the next
      // autosave tick must compare against THIS revision, not the one that
      // was current before this save, or it would immediately (and
      // incorrectly) look like a conflict with its own prior save.
      setProject((prev) => (prev ? { ...prev, id: saved.id, revision: saved.revision } : prev));
      if (!id && saved.id) navigate(`/project/${saved.id}`, { replace: true });
    } catch (err) {
      showMessage(
        getFriendlySaveErrorMessage(err, "Failed to save automatically."),
        "error",
      );
    }
  };

  const handleExportPDF = async () => {
    if (!project) return;

    try {
      persistDraftIfEditable(project); // best-effort, same as before — not awaited

      setIsExporting(true);

      // Wait for every hidden export page to report itself ready —
      // mounted, ref attached, and (for the async Room Layout pages) its
      // SVG tiles inlined and sidebar images loaded — before starting the
      // actual capture. This is what makes the export correct whether the
      // user just opened the project (cold cache) or has already expanded
      // every room (warm cache): either way, exportPDF() only ever sees
      // fully-rendered pages, never a page that's still mid-load.
      const expectedReadyIds = [
        "cover",
        "design-params",
        ...project.rooms.flatMap((room) => [
          `detail-${room.id}`,
          `layout-${room.id}`,
        ]),
        "materials-summary",
      ];
      await readinessGateRef.current!.waitFor(expectedReadyIds);

      await exportPDF(
        headerRef.current,
        designParamsRef.current,
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

    const newRoom: RoomInput = createEmptyRoom(`Room ${project.rooms.length + 1}`);
    setProject({ ...project, rooms: [...project.rooms, newRoom] });
    setDirtyVersion((v) => v + 1);
    showMessage("Room Added", "success");
  };

  const updateRoom = (roomId: string, patch: Partial<RoomInput>) => {
    if (!project) return;
    const updatedRooms = project.rooms.map((r) =>
      r.id === roomId ? { ...r, ...patch } : r,
    );
    setProject({ ...project, rooms: updatedRooms });
    setDirtyVersion((v) => v + 1);
  };

  const removeRoom = (roomId: string) => {
    if (!project) return;
    const updatedRooms = project.rooms.filter((r) => r.id !== roomId);
    setProject({ ...project, rooms: updatedRooms });
    setDirtyVersion((v) => v + 1);
  };

  const summary: ProjectSummary | null = useProjectSummary(
    project?.rooms || [],
    project || undefined,
  );

  // Read-only preview of the same validator that gates Save (see
  // handleSaveProject below) — used only to make the toolbar's status
  // pill and Save button label reflect reality (e.g. "Publish Project"
  // vs "Save Draft") before the user even clicks. Deliberately does NOT
  // use useProjectDirtyTracker (that hook already runs once inside
  // ProjectEditor) — a second independent tracker instance up here could
  // drift out of sync with that one; validateProject() alone is pure and
  // stateless, so there's nothing to keep in sync.
  const validationPreview = useMemo(
    () => (project ? validateProject(project) : null),
    [project],
  );

  // Manual "Save Project" — the only action that can publish a project.
  // Runs strict validation (the same engine powering the in-editor
  // validation UI — see src/validations.ts/projectValidator.ts) and
  // branches per docs/PROJECT_WORKFLOW.md's lifecycle:
  //   - complete + valid            -> publish (status: "published")
  //   - already published, now bad  -> do NOT save; last known-good
  //                                    published copy in Firestore is
  //                                    left untouched (Published
  //                                    projects must never be saved
  //                                    while invalid)
  //   - otherwise (still a draft)   -> save anyway as a draft; drafts
  //                                    must always be saveable so
  //                                    in-progress work is never lost
  const handleSaveProject = async () => {
    if (!project) return;

    setIsSaving(true);
    try {
      const validation = validateProject(project);

      if (validation.complete) {
        const saved = await publishProjectToDb(project);
        setProject((prev) => (prev ? { ...prev, id: saved.id, revision: saved.revision, status: "published" } : prev));
        if (!id && saved.id) navigate(`/project/${saved.id}`, { replace: true });
        showMessage("Project saved and published.", "success");
      } else if (project.status === "published") {
        showMessage(
          "This project is published, but your recent changes are invalid or incomplete. Fix the highlighted issues before saving — your changes have not been saved yet.",
          "error",
        );
      } else {
        const saved = await saveDraftToDb(project);
        setProject((prev) => (prev ? { ...prev, id: saved.id, revision: saved.revision } : prev));
        if (!id && saved.id) navigate(`/project/${saved.id}`, { replace: true });
        showMessage(
          "Saved as a draft. Fix the highlighted issues to publish this project.",
          "info",
        );
      }
    } catch (err) {
      showMessage(
        getFriendlySaveErrorMessage(err, "Something went wrong while saving."),
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Autosave — draft-safe only. Per the finalized workflow, there are no
  // automatic Firestore saves once a project is Published; see
  // persistDraftIfEditable above, shared with the pre-export save.
  //
  // Deliberately keyed on `dirtyVersion`, NOT `project` itself: this effect
  // still reads the latest `project` from closure (a fresh closure is
  // created every render regardless of the dependency array, so it's never
  // stale), but only actually RUNS again when a user edit bumped
  // `dirtyVersion`. If this depended on `project` directly, the
  // `setProject` call inside persistDraftIfEditable that syncs back the
  // Firestore-assigned `revision` would itself change `project`'s
  // reference, re-triggering this same effect, saving again, bumping
  // `revision` again — an infinite autosave loop with no further user
  // input needed to keep it going.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!project) return;

    const timeout = setTimeout(() => {
      persistDraftIfEditable(project);
    }, 800); // small delay to avoid saving every keystroke

    return () => clearTimeout(timeout);
  }, [dirtyVersion]);

  if (!project)
    return (
      <div className="flex h-screen items-center justify-center">
        <CircularProgress color="primary" size={48} thickness={4} />
      </div>
    );

  // Report page numbering — the hidden export DOM always assembles the
  // same fixed structure (1 cover/summary + 1 design parameters + 2
  // pages/room + 1 materials summary), so every page's number is known
  // synchronously at render time; no need to wait for the PDF to be
  // assembled to know "page X of Y".
  const totalPages = 3 + project.rooms.length * 2;

  // Toolbar status pill — always visible (unlike ProjectStatusCard, which
  // scrolls out of view), so "what state is this project in" doesn't
  // require scrolling back up. Deliberately simpler than
  // ProjectStatusCard's full ProjectStatus (no draft/readyToSave/saved
  // distinction, which needs the dirty tracker) — see the comment on
  // validationPreview above for why this stays independent of that hook.
  const statusPill = !validationPreview
    ? null
    : validationPreview.status === "invalid"
      ? { label: "Needs attention", dot: "bg-red-500", text: "text-red-700" }
      : project.status === "published"
        ? {
            label: "Published",
            dot: "bg-emerald-500",
            text: "text-emerald-700",
          }
        : validationPreview.complete
          ? {
              label: "Ready to publish",
              dot: "bg-sky-500",
              text: "text-sky-700",
            }
          : { label: "Draft", dot: "bg-amber-400", text: "text-amber-700" };

  const saveButtonLabel = isSaving
    ? "Saving..."
    : validationPreview?.complete
      ? "Publish Project"
      : project.status === "published"
        ? "Save Project"
        : "Save Draft";

  return (
    <>
      <AppLayout
        title="Ultra-Calc"
        subtitle="Room-by-room heat loss calculation and project management for HVAC professionals."
      >
        <main className="p-4 sm:p-4 max-w-7xl mx-auto min-h-screen bg-white">
          {/* Toolbar — stable across all tabs (Add Room now lives in the
              Rooms tab itself, next to the "Rooms" heading, matching where
              "+ New Project" lives on the dashboard) so switching tabs no
              longer shifts the toolbar's layout. Project name + status
              pill stay visible here at all times, since the in-editor
              ProjectStatusCard scrolls out of view once you're down in
              the room list. */}
          <div className="sticky top-[64px] z-40 bg-white border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* LEFT: Navigation + Context */}
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => navigate("/")}
                  className="shrink-0 px-3 py-2 text-sm font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                >
                  ← Back
                </button>

                {/* Add Room */}
                {activeTab === "rooms" && (
                  <button
                    onClick={addRoom}
                    className="px-3 py-2 text-sm font-semibold rounded-md bg-cyan-500 text-white hover:bg-cyan-600 transition shadow-sm"
                  >
                    + Add Room
                  </button>
                )}

                {/* Add rooms from a plan - only once the project has been
                    saved (an unsaved draft has no id to append rooms to). */}
                {activeTab === "rooms" && project.id && (
                  <button
                    onClick={() => navigate(`/project/${project.id}/import`)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition"
                  >
                    <FileUp size={15} aria-hidden="true" />
                    Add rooms from a plan
                  </button>
                )}
                              </div>

              {/* RIGHT: Actions — Save is the one unambiguous primary
                  action (filled). Export is secondary (outlined). Delete
                  is destructive, rare, and already confirm-gated below —
                  shrunk to an icon and separated by a divider so a fast
                  click near Export can't land on it by accident. */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  onClick={handleSaveProject}
                  disabled={isSaving}
                  className={`px-3 py-2 text-sm font-semibold rounded-md text-white transition shadow-sm
        ${
          isSaving
            ? "bg-slate-400 cursor-not-allowed"
            : "bg-blue-900 hover:bg-blue-800"
        }`}
                >
                  {saveButtonLabel}
                </button>

                <button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className={`px-3 py-2 text-sm font-medium rounded-md border border-slate-300 transition
        ${
          isExporting
            ? "text-slate-400 bg-slate-100 cursor-not-allowed"
            : "text-slate-700 hover:bg-slate-100"
        }`}
                >
                  {isExporting ? "Exporting..." : "Export PDF"}
                </button>

                {project.id && (
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    aria-label="Delete project"
                    title="Delete project"
                    className="ml-1 shrink-0 rounded-md border-l border-slate-200 py-2 pl-3 text-slate-400 transition hover:text-red-600"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Project Editor */}
          <div className="w-full overflow-x-auto pt-4">
            <ProjectEditor
              project={project}
              rooms={project.rooms}
              onUpdateProject={updateProject}
              onUpdateRoom={updateRoom}
              onRemoveRoom={removeRoom}
              onAddRoom={addRoom}
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
      {/* Kept fully opaque and normally laid out (html2canvas needs a real,
          painted element — see AGENTS.md's PDF Generator note), tucked
          behind the app's own opaque UI via z-index rather than shoved to
          an extreme off-viewport offset. Deliberately `position: absolute`,
          not `fixed`: a `fixed` element is anchored to the viewport and is
          excluded from the document's scrollable content area, so when
          this tree is taller than the current viewport (routine for a
          multi-room project — several stacked A4-equivalent pages), the
          part beyond the viewport's height may not be fully laid out/
          capturable. `absolute` still expands the page's normal scrollable
          height to fit its full content regardless of viewport size, so it
          isn't sensitive to how large the browser window/viewport happens
          to be (small on a phone, or shrunk by an open DevTools panel). */}
      <div style={{ position: "absolute", left: "-99999px", top: 0 }}>
        {/* ───────────── PAGE 1 — Cover + Project Summary + Notes ───────────── */}
        <CoverPage
          ref={headerRef}
          project={project}
          summary={summary}
          logoBase64={logoBase64}
          pageNumber={1}
          totalPages={totalPages}
          onReady={() => readinessGateRef.current!.markReady("cover")}
        />

        {/* ───────────── PAGE 2 — Design Parameters ───────────── */}
        <DesignParametersPage
          ref={designParamsRef}
          project={project}
          logoBase64={logoBase64}
          pageNumber={2}
          totalPages={totalPages}
          onReady={() => readinessGateRef.current!.markReady("design-params")}
        />

        {/* ───────────── PER ROOM ───────────── */}
        {project.rooms.map((room, i) => (
          <React.Fragment key={room.id}>
            <RoomDetailsExport
              ref={(el) => (detailRefs.current[i] = el!)}
              room={room}
              project={project}
              logoBase64={logoBase64}
              pageNumber={3 + i * 2}
              totalPages={totalPages}
              onReady={() =>
                readinessGateRef.current!.markReady(`detail-${room.id}`)
              }
            />

            <RoomLayoutExport
              ref={(el) => (layoutRefs.current[i] = el!)}
              room={room}
              project={project}
              logoBase64={logoBase64}
              pageNumber={4 + i * 2}
              totalPages={totalPages}
              onReady={() =>
                readinessGateRef.current!.markReady(`layout-${room.id}`)
              }
            />
          </React.Fragment>
        ))}

        {/* ───────────── MATERIALS SUMMARY ───────────── */}
        <MaterialsSummaryPage
          ref={summaryRef}
          project={project}
          summary={summary}
          logoBase64={logoBase64}
          pageNumber={totalPages}
          totalPages={totalPages}
          onReady={() =>
            readinessGateRef.current!.markReady("materials-summary")
          }
        />
      </div>
    </>
  );
}
