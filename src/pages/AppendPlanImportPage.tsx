import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AlertCircle, ArrowLeft, FileText, FileUp, LoaderCircle, Trash2 } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { ConfirmDialog } from "../components/layout/ConfirmDialog";
import { useSnackbar } from "../contexts/SnackbarProvider";
import { auth } from "../firebase";
import { loadPdfDocument } from "../plan-import/browser/pdfDocument";
import { renderPdfPage, type PdfRenderResult } from "../plan-import/browser/pdfRenderer";
import type { PreparedV2ReviewedImport } from "../plan-import/pipeline/convertV2ReviewToRoomInput";
import { detectExistingRoomDuplicates, type AppendRoomCandidate } from "../plan-import/pipeline/detectExistingRoomDuplicates";
import ExperimentalV2Panel from "../components/plan-import/ExperimentalV2Panel";
import AppendRoomsReviewCard from "../components/plan-import/AppendRoomsReviewCard";
import {
  appendRoomsToProject,
  fetchProjectById,
  type AppendRoomDecision,
  type AppendRoomDecisionInput,
  type RichProject,
} from "../services/firebaseHelpers";
import { getFriendlySaveErrorMessage } from "../utils/friendlyError";
import type { PlanImportProjectMetadata } from "../models/projectTypes";

type ImportState = "idle" | "fileSelected";

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Same backend resolution as PlanImportPlaceholderPage.tsx - see python-backend/README.md.
const PLAN_BACKEND_URL =
  (import.meta.env.VITE_PLAN_BACKEND_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

function buildAppendRunMetadata(
  prepared: PreparedV2ReviewedImport,
  decisions: Record<string, AppendRoomDecision>,
): PlanImportProjectMetadata {
  const reviewByRoomId = new Map(prepared.review.rooms.map((room) => [room.roomId, room]));
  return {
    source: "backend",
    provider: prepared.provider,
    fileName: prepared.fileName,
    importedAt: Date.now(),
    warnings: prepared.warnings,
    v2Review: { ...prepared.review, reviewerId: auth.currentUser?.uid ?? null },
    rooms: prepared.convertedRooms.map((converted) => {
      const reviewedRoom = reviewByRoomId.get(converted.reviewRoomId);
      const decision = decisions[converted.reviewRoomId] ?? "add";
      return {
        roomInputId: converted.roomInput.id,
        sourceRoomId: converted.sourceRoomId,
        pageNumber: converted.pageNumber,
        roomName: converted.roomInput.name,
        confidence: 0,
        status: "reviewed",
        reviewStatus: "human-approved",
        evidence: reviewedRoom?.evidenceIds ?? [],
        reviewReasons: converted.reviewReasons,
        cropDataUrl: null,
        cropDataUrlOmittedReason: "Plan images used during review aren't saved with the project.",
        appendDecision: decision === "add" ? "added" : decision === "replace" ? "replaced" : "skipped",
      };
    }),
  };
}

export default function AppendPlanImportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const debugMode = searchParams.get("debug") === "1";
  const { showMessage } = useSnackbar();
  const inputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<RichProject | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [renderInfo, setRenderInfo] = useState<PdfRenderResult | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectionRequestRef = useRef(0);

  const [pendingAppend, setPendingAppend] = useState<PreparedV2ReviewedImport | null>(null);
  const [candidates, setCandidates] = useState<AppendRoomCandidate[]>([]);
  const [decisions, setDecisions] = useState<Record<string, AppendRoomDecision>>({});
  const [isAppending, setIsAppending] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setIsLoadingProject(false);
        return;
      }
      const found = await fetchProjectById(id);
      if (!cancelled) {
        setProject(found);
        setIsLoadingProject(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || state === "idle") return;

    let cancelled = false;
    const render = async () => {
      try {
        const rendered = await renderPdfPage(pdfDocument, selectedPage, canvasRef.current!, { maxWidth: 1200 });
        if (!cancelled) setRenderInfo(rendered);
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "We couldn't display this page. Try a different page or re-upload the PDF.");
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfDocument, selectedPage, state]);

  const selectFile = async (candidate: File | undefined) => {
    if (!candidate) return;
    const isPdf = candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("PDF files only. Choose an architectural plan saved as a PDF.");
      return;
    }
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    setError(null);
    setFile(candidate);
    setPdfDocument(null);
    setPageCount(null);
    setSelectedPage(1);
    setRenderInfo(null);
    setPendingAppend(null);
    setCandidates([]);
    setDecisions({});
    setAppendError(null);
    setState("fileSelected");

    setIsLoadingPdf(true);
    try {
      const data = await candidate.arrayBuffer();
      const loaded = await loadPdfDocument(data);
      if (selectionRequestRef.current !== requestId) return;
      setPdfDocument(loaded.document);
      setPageCount(loaded.pageCount);
    } catch (loadError) {
      if (selectionRequestRef.current === requestId) {
        setFile(null);
        setState("idle");
        setError(loadError instanceof Error ? loadError.message : "We couldn't open this PDF. Make sure the file isn't corrupted and try again.");
      }
    } finally {
      if (selectionRequestRef.current === requestId) setIsLoadingPdf(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setPdfDocument(null);
    setPageCount(null);
    setSelectedPage(1);
    setRenderInfo(null);
    setPendingAppend(null);
    setCandidates([]);
    setDecisions({});
    setAppendError(null);
    selectionRequestRef.current += 1;
    setState("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Reused unchanged: prepared.convertedRooms already ran through the full Luna
  // V2 extraction/job-polling/review/conversion pipeline inside ExperimentalV2Panel.
  // This handler only decides WHERE those rooms go - it never re-derives them.
  const handleReviewedImport = async (prepared: PreparedV2ReviewedImport) => {
    if (!project) {
      throw new Error("This project hasn't finished loading yet. Please wait and try again.");
    }
    if (prepared.convertedRooms.length === 0) {
      throw new Error("Accept at least one reviewed room before continuing.");
    }
    const detected = detectExistingRoomDuplicates(prepared.convertedRooms, project.rooms);
    setCandidates(detected);
    setDecisions(Object.fromEntries(detected.map((candidate) => [candidate.convertedRoom.reviewRoomId, "add" as AppendRoomDecision])));
    setAppendError(null);
    setPendingAppend(prepared);
  };

  const handleDecisionChange = (reviewRoomId: string, decision: AppendRoomDecision) => {
    setDecisions((prev) => ({ ...prev, [reviewRoomId]: decision }));
  };

  const handleCancelAppend = () => {
    setPendingAppend(null);
    setCandidates([]);
    setDecisions({});
    setAppendError(null);
  };

  const handleConfirmAppend = async () => {
    if (!id || !pendingAppend) return;
    setIsAppending(true);
    setAppendError(null);
    try {
      const decisionInputs: AppendRoomDecisionInput[] = candidates.map((candidate) => ({
        decision: decisions[candidate.convertedRoom.reviewRoomId] ?? "add",
        roomInput: candidate.convertedRoom.roomInput,
        matchedExistingRoomId: candidate.matchedExistingRoomId,
      }));
      const runMetadata = buildAppendRunMetadata(pendingAppend, decisions);
      const updated = await appendRoomsToProject(id, decisionInputs, runMetadata);
      setProject(updated);
      showMessage("Rooms added to the project.", "success");
      navigate(`/project/${id}`);
    } catch (saveError) {
      const message = getFriendlySaveErrorMessage(saveError, "We couldn't add these rooms to the project. Please try again.");
      setAppendError(message);
      showMessage(message, "error");
    } finally {
      setIsAppending(false);
    }
  };

  if (isLoadingProject) {
    return (
      <AppLayout>
        <section className="mx-auto max-w-4xl py-6">
          <p className="text-slate-600">Loading project...</p>
        </section>
      </AppLayout>
    );
  }

  if (!id || !project) {
    return (
      <AppLayout>
        <section className="mx-auto max-w-4xl py-6">
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            We couldn't find that project, or you don't have access to it.
          </p>
          <button type="button" onClick={() => navigate("/dashboard")} className="mt-4 text-sm font-semibold text-blue-700 hover:text-blue-800">
            Back to dashboard
          </button>
        </section>
      </AppLayout>
    );
  }

  // Protect in-progress review decisions (post-scan, pre-confirm) from being lost
  // if the user navigates back to the project before saving them.
  const hasUnsavedAppendProgress = pendingAppend !== null;
  const handleBackClick = () => {
    if (hasUnsavedAppendProgress) {
      setShowBackConfirm(true);
      return;
    }
    navigate(`/project/${id}`);
  };

  return (
    <AppLayout>
      <section className="mx-auto max-w-4xl py-6">
        <button
          type="button"
          onClick={handleBackClick}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to {project.name || "project"}
        </button>

        {showBackConfirm && (
          <ConfirmDialog
            title="Discard this review?"
            message="You have reviewed rooms that haven't been added to the project yet. Going back will discard this review."
            confirmText="Discard and go back"
            cancelText="Keep reviewing"
            onConfirm={() => { setShowBackConfirm(false); navigate(`/project/${id}`); }}
            onCancel={() => setShowBackConfirm(false)}
          />
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <FileUp size={22} aria-hidden="true" />
          </span>
          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Import rooms from a floor plan
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Add rooms to {project.name || "this project"}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Upload another PDF or re-scan specific pages, then review every detected room. Nothing in
            this project is changed until you confirm which rooms to add below.
          </p>

          {state === "idle" && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
              }}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files[0]); }}
              className={`mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${isDragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50"}`}
            >
              <FileUp size={32} className="text-emerald-700" aria-hidden="true" />
              <h2 className="mt-4 font-semibold text-slate-900">Drop a PDF plan here</h2>
              <p className="mt-1 text-sm text-slate-600">or choose a file from your device</p>
              <span className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Choose PDF</span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {file && state !== "idle" && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <FileText size={22} className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{file.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    PDF · {formatBytes(file.size)}
                    {pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}
                    {isLoadingPdf ? " · reading..." : ""}
                  </p>
                </div>
                <button type="button" onClick={removeFile} className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label="Remove selected PDF">
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <ExperimentalV2Panel
            file={file}
            pageCount={pageCount}
            backendUrl={PLAN_BACKEND_URL}
            isCreatingProject={isAppending}
            onCreateDraftProject={handleReviewedImport}
            debugMode={debugMode}
          />

          {pendingAppend && (
            <AppendRoomsReviewCard
              candidates={candidates}
              existingRooms={project.rooms}
              region={project.region}
              decisions={decisions}
              onDecisionChange={handleDecisionChange}
              onConfirm={() => void handleConfirmAppend()}
              onCancel={handleCancelAppend}
              isSaving={isAppending}
              error={appendError}
            />
          )}

          {pdfDocument && pageCount && state !== "idle" && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">PDF page preview</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Page {selectedPage} of {pageCount} · rendered in your browser
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  Page
                  <select
                    value={selectedPage}
                    onChange={(event) => setSelectedPage(Number(event.target.value))}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 font-normal"
                  >
                    {Array.from({ length: pageCount }, (_, index) => (
                      <option key={index + 1} value={index + 1}>{index + 1}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-slate-300 bg-slate-700 p-3">
                <canvas ref={canvasRef} className="mx-auto block h-auto max-w-full bg-white shadow-sm" aria-label={`Rendered PDF page ${selectedPage}`} />
              </div>
              {renderInfo && debugMode && (
                <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                  <div className="rounded-lg bg-white p-3"><span className="block font-semibold text-slate-900">Page preview size</span>{renderInfo.width} × {renderInfo.height}px</div>
                </div>
              )}
            </div>
          )}

          {isLoadingPdf && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              <LoaderCircle size={22} className="animate-spin" aria-hidden="true" />
              <div><p className="font-semibold">Reading {file?.name}</p><p className="mt-1">Loading your PDF in the browser. No automatic room detection has started yet.</p></div>
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  );
}
