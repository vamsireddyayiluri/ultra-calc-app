import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileText,
  FileUp,
  Layers,
  ListChecks,
  LoaderCircle,
  Pencil,
  ScanSearch,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { loadPdfDocument } from "../plan-import/browser/pdfDocument";
import {
  extractPageTextDiagnostics,
  type PdfTextDiagnostics,
} from "../plan-import/browser/pdfText";
import {
  renderPdfPage,
  type PdfRenderResult,
} from "../plan-import/browser/pdfRenderer";
import {
  recognizeCanvas,
  type BrowserOcrResult,
  type OcrProgress,
} from "../plan-import/browser/ocr";
import { analyzePlanObservations } from "../plan-import/core/planAnalysis";
import {
  validateRoomCrop,
  type RoomCropValidation,
} from "../plan-import/core/validateRoomCrop";
import {
  createRoomCrop,
  type RoomCropResult,
} from "../plan-import/browser/roomCrop";
import { MockBrowserAiClient } from "../plan-import/ai/mockBrowserAiClient";
import type { AiDraftAnalysis } from "../plan-import/ai/contracts";
import { GeminiBrowserAiClient } from "../plan-import/ai/geminiBrowserAiClient";
import { GEMINI_BROWSER_KEY_WARNING, getGeminiBrowserApiKey } from "../plan-import/ai/browserConfig";
import {
  analyzePlanDocument,
  type AnalyzePlanProgress,
  type AutomatedPlanAnalysis,
} from "../plan-import/pipeline/analyzePlanDocument";
import type { FinalRoomCandidateWithDimensionReview } from "../plan-import/pipeline/reviewRoomDimensions";
import { convertApprovedRoomsToRoomInputs, type ApprovedRoomEdit } from "../plan-import/pipeline/convertApprovedRoomsToRoomInput";

type ImportState = "idle" | "fileSelected" | "analyzing" | "analysisComplete";

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Local-only human approval layer on top of the analysis pipeline: edits here never
// touch the underlying OCR/Gemini/merge/dimension results, and are not persisted.
type FinalRoomReviewDecision = "pending" | "accepted" | "rejected";

interface FinalRoomReviewState {
  decision: FinalRoomReviewDecision;
  name: string;
  horizontalText: string;
  verticalText: string;
}

function buildInitialRoomReviews(
  finalRooms: FinalRoomCandidateWithDimensionReview[],
): Record<string, FinalRoomReviewState> {
  const initial: Record<string, FinalRoomReviewState> = {};
  for (const room of finalRooms) {
    initial[room.id] = {
      decision: "pending",
      name: room.roomName,
      horizontalText: room.dimensionReview.recommendation.primaryHorizontal?.candidate.originalText ?? "",
      verticalText: room.dimensionReview.recommendation.primaryVertical?.candidate.originalText ?? "",
    };
  }
  return initial;
}

function roomNeedsReview(room: FinalRoomCandidateWithDimensionReview): boolean {
  return room.status !== "ready"
    || room.reviewStatus !== "ok"
    || room.dimensionAssociation.reviewRequired
    || room.dimensionReview.disagreement;
}

export default function PlanImportPlaceholderPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ImportState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [textDiagnostics, setTextDiagnostics] = useState<PdfTextDiagnostics | null>(null);
  const [renderInfo, setRenderInfo] = useState<PdfRenderResult | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [ocrResult, setOcrResult] = useState<BrowserOcrResult | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [selectedRoomLabelIndex, setSelectedRoomLabelIndex] = useState<number | null>(null);
  const [cropPadding, setCropPadding] = useState(900);
  const [roomCrop, setRoomCrop] = useState<RoomCropResult | null>(null);
  const [roomCropValidation, setRoomCropValidation] = useState<RoomCropValidation | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<AiDraftAnalysis | null>(null);
  const aiClient = useRef(new MockBrowserAiClient());
  const geminiClient = useRef(new GeminiBrowserAiClient());
  const [aiProvider, setAiProvider] = useState<"mock" | "gemini">("mock");
  const [automatedStatus, setAutomatedStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [automatedProgress, setAutomatedProgress] = useState<AnalyzePlanProgress | null>(null);
  const [automatedAnalysis, setAutomatedAnalysis] = useState<AutomatedPlanAnalysis | null>(null);
  const [automatedError, setAutomatedError] = useState<string | null>(null);
  const [automatedAiReviewEnabled, setAutomatedAiReviewEnabled] = useState(false);
  const [automatedAiProvider, setAutomatedAiProvider] = useState<"mock" | "gemini">("mock");
  const [automatedRoomDiscoveryEnabled, setAutomatedRoomDiscoveryEnabled] = useState(false);
  const [automatedRoomDiscoveryProvider, setAutomatedRoomDiscoveryProvider] = useState<"mock" | "gemini">("mock");
  const [automatedDimensionReviewEnabled, setAutomatedDimensionReviewEnabled] = useState(false);
  const [automatedDimensionReviewProvider, setAutomatedDimensionReviewProvider] = useState<"mock" | "gemini">("mock");
  const [roomReviews, setRoomReviews] = useState<Record<string, FinalRoomReviewState>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const [analysisRenderInfo, setAnalysisRenderInfo] = useState<PdfRenderResult | null>(null);
  const selectionRequestRef = useRef(0);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || state === "idle") return;

    let cancelled = false;
    const render = async () => {
      try {
        const rendered = await renderPdfPage(
          pdfDocument,
          selectedPage,
          canvasRef.current!,
          { maxWidth: 1200 },
        );
        const analysisRendered = await renderPdfPage(
          pdfDocument,
          selectedPage,
          analysisCanvasRef.current!,
          { scale: 300 / 72 },
        );
        const diagnostics = await extractPageTextDiagnostics(pdfDocument, selectedPage);
        if (!cancelled) {
          setRenderInfo(rendered);
          setAnalysisRenderInfo(analysisRendered);
          setTextDiagnostics(diagnostics);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Unable to inspect this PDF page.");
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
    setTextDiagnostics(null);
    setRenderInfo(null);
    setAnalysisRenderInfo(null);
    setOcrResult(null);
    setOcrProgress(null);
    setOcrStatus("idle");
    setSelectedRoomLabelIndex(null);
    setRoomCrop(null);
    setRoomCropValidation(null);
    setAiStatus("idle");
    setAiError(null);
    setAiDraft(null);
    setAiProvider("mock");
    setAutomatedStatus("idle");
    setAutomatedProgress(null);
    setAutomatedAnalysis(null);
    setAutomatedError(null);
    setRoomReviews({});
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
        setError(loadError instanceof Error ? loadError.message : "Unable to read this PDF.");
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
    setTextDiagnostics(null);
    setRenderInfo(null);
    setAnalysisRenderInfo(null);
    setOcrResult(null);
    setOcrProgress(null);
    setOcrStatus("idle");
    setSelectedRoomLabelIndex(null);
    setRoomCrop(null);
    setRoomCropValidation(null);
    setAiStatus("idle");
    setAiError(null);
    setAiDraft(null);
    setAiProvider("mock");
    setAutomatedStatus("idle");
    setAutomatedProgress(null);
    setAutomatedAnalysis(null);
    setAutomatedError(null);
    setRoomReviews({});
    selectionRequestRef.current += 1;
    setState("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyzeAllPlans = async () => {
    if (!file) return;
    setAutomatedError(null);
    setAutomatedAnalysis(null);
    setAutomatedStatus("running");
    setAutomatedProgress(null);
    try {
      const result = await analyzePlanDocument(file, {
        onProgress: setAutomatedProgress,
        pageReviewAiClient: automatedAiReviewEnabled
          ? (automatedAiProvider === "gemini" ? geminiClient.current : aiClient.current)
          : undefined,
        pageRoomDiscoveryAiClient: automatedRoomDiscoveryEnabled
          ? (automatedRoomDiscoveryProvider === "gemini" ? geminiClient.current : aiClient.current)
          : undefined,
        dimensionReviewAiClient: automatedDimensionReviewEnabled
          ? (automatedDimensionReviewProvider === "gemini" ? geminiClient.current : aiClient.current)
          : undefined,
      });
      setAutomatedAnalysis(result);
      setRoomReviews(buildInitialRoomReviews(result.finalRooms));
      setAutomatedStatus("complete");
    } catch (automatedAnalysisError) {
      setAutomatedStatus("error");
      setAutomatedError(
        automatedAnalysisError instanceof Error ? automatedAnalysisError.message : "Unable to analyze this PDF automatically.",
      );
    }
  };

  // Local-only edits/decisions for the final room review list - never touch the
  // underlying pipeline results and are not persisted anywhere.
  const updateRoomReviewField = (roomId: string, patch: Partial<FinalRoomReviewState>) => {
    setRoomReviews((previous) => {
      const current = previous[roomId];
      if (!current) return previous;
      return { ...previous, [roomId]: { ...current, ...patch } };
    });
  };

  const acceptRoomReview = (roomId: string) => updateRoomReviewField(roomId, { decision: "accepted" });
  const rejectRoomReview = (roomId: string) => updateRoomReviewField(roomId, { decision: "rejected" });
  const restoreRoomReview = (roomId: string) => updateRoomReviewField(roomId, { decision: "pending" });

  const handleAnalyze = async () => {
    if (!file || !pdfDocument) return;
    setError(null);
    setState("analyzing");
    try {
      const diagnostics = await extractPageTextDiagnostics(pdfDocument, selectedPage);
      setTextDiagnostics(diagnostics);
      setState("analysisComplete");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Unable to inspect this PDF page.");
      setState("fileSelected");
    }
  };

  const handleRunOcr = async () => {
    if (!analysisCanvasRef.current || !pdfDocument) return;
    setError(null);
    setOcrStatus("running");
    setOcrResult(null);
    setOcrProgress({ status: "Starting OCR", progress: 0 });

    try {
      const result = await recognizeCanvas(analysisCanvasRef.current, setOcrProgress);
      setOcrResult(result);
      setOcrStatus("complete");
    } catch (ocrError) {
      setOcrStatus("error");
      setError(ocrError instanceof Error ? ocrError.message : "Unable to run OCR in the browser.");
    }
  };

  const planAnalysis = ocrResult
    ? analyzePlanObservations(ocrResult.observations, analysisCanvasRef.current)
    : null;
  const dimensionCandidates = planAnalysis?.dimensionCandidates ?? [];
  const dimensionSummary = planAnalysis?.dimensionSummary ?? {
    total: 0,
    high: 0,
    medium: 0,
    uncertain: 0,
    rejected: 0,
  };
  const preSpatialDimensionSummary = planAnalysis?.preSpatialDimensionSummary ?? dimensionSummary;

  const handleGenerateRoomCrop = () => {
    if (!analysisCanvasRef.current || !planAnalysis || selectedRoomLabelIndex === null) return;
    const label = planAnalysis.roomLabels[selectedRoomLabelIndex];
    if (!label) return;
    try {
      const generatedCrop = createRoomCrop(analysisCanvasRef.current, label, selectedPage, cropPadding);
      setRoomCrop(generatedCrop);
      setRoomCropValidation(validateRoomCrop({
        metadata: generatedCrop.metadata,
        selectedLabel: label,
        roomLabels: planAnalysis.roomLabels,
        ocrObservations: ocrResult?.observations ?? [],
        dimensionCandidates: planAnalysis.dimensionCandidates,
      }));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Unable to generate the room crop.");
    }
  };

  const handleAnalyzeRoomWithAi = async () => {
    if (!roomCrop || !roomCropValidation || roomCropValidation.status === "insufficient" || !planAnalysis) return;
    setAiStatus("running");
    setAiError(null);
    try {
      const client = aiProvider === "gemini" ? geminiClient.current : aiClient.current;
      const draft = await client.analyzeRoomCrop({
        cropDataUrl: roomCrop.dataUrl,
        crop: roomCrop.metadata,
        ocrDimensionCandidates: planAnalysis.dimensionCandidates,
        ocrObservations: ocrResult?.observations ?? [],
      });
      setAiDraft(draft);
      setAiStatus("complete");
    } catch (analysisError) {
      setAiStatus("error");
      setAiError(analysisError instanceof Error ? analysisError.message : "Unable to analyze the room crop.");
    }
  };

  const roomReviewCounts = {
    accepted: Object.values(roomReviews).filter((review) => review.decision === "accepted").length,
    pending: Object.values(roomReviews).filter((review) => review.decision === "pending").length,
    rejected: Object.values(roomReviews).filter((review) => review.decision === "rejected").length,
  };

  const approvedRoomEdits: ApprovedRoomEdit[] = automatedAnalysis
    ? automatedAnalysis.finalRooms
      .filter((room) => roomReviews[room.id]?.decision === "accepted")
      .map((room) => ({
        roomId: room.id,
        name: roomReviews[room.id].name,
        horizontalText: roomReviews[room.id].horizontalText,
        verticalText: roomReviews[room.id].verticalText,
      }))
    : [];
  const convertedRoomInputs = automatedAnalysis
    ? convertApprovedRoomsToRoomInputs(automatedAnalysis.finalRooms, approvedRoomEdits)
    : [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <section className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => navigate("/project/new")}
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to project options
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <FileUp size={22} aria-hidden="true" />
          </span>
          <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            AI-assisted plan import
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Upload an architectural plan
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            This local prototype keeps your file in this page only. Future analysis will detect rooms and dimensions, then let you review missing information before anything enters the calculator.
          </p>
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-950">Prefer a faster manual workflow?</p>
            <p className="mt-1 text-sm text-blue-900">View the PDF beside the existing room editor and enter rooms one at a time without running OCR or AI.</p>
            <button type="button" onClick={() => navigate("/project/manual-import")} className="mt-3 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Open manual PDF-assisted entry</button>
          </div>

          <div className="mt-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className={state === "idle" ? "text-emerald-700" : "text-slate-400"}>1 Upload plan</span>
            <span aria-hidden="true">/</span>
            <span className={state === "fileSelected" ? "text-emerald-700" : "text-slate-400"}>2 File selected</span>
            <span aria-hidden="true">/</span>
            <span className={state === "analyzing" ? "text-emerald-700" : "text-slate-400"}>3 Analysis</span>
            <span aria-hidden="true">/</span>
            <span className={state === "analysisComplete" ? "text-emerald-700" : "text-slate-400"}>4 Review</span>
          </div>

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
                  </p>
                </div>
                <button type="button" onClick={removeFile} className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label="Remove selected PDF">
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              {state === "fileSelected" && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={() => void handleAnalyze()} disabled={isLoadingPdf || !pdfDocument} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                    <ScanSearch size={17} aria-hidden="true" />
                    {isLoadingPdf ? "Reading PDF..." : "Inspect PDF"}
                  </button>
                  <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Replace file
                  </button>
                </div>
              )}
            </div>
          )}

          {file && pdfDocument && state !== "idle" && (
            <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-indigo-950">
                    <Layers size={18} aria-hidden="true" />
                    Automated multi-page analysis
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-indigo-900">
                    Automatically OCRs every page, detects room labels, and runs deterministic filtering and crop
                    validation. Optionally sends the filtered candidates for each page to Gemini, one request per
                    page, for a visual room-vs-not-a-room review. This does not create any project rooms.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-950">
                    <input
                      type="checkbox"
                      checked={automatedAiReviewEnabled}
                      onChange={(event) => setAutomatedAiReviewEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-indigo-300"
                    />
                    Also run Gemini page-level room candidate review
                  </label>
                  {automatedAiReviewEnabled && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-indigo-900">
                      <label className="flex items-center gap-2">
                        AI provider
                        <select
                          value={automatedAiProvider}
                          onChange={(event) => setAutomatedAiProvider(event.target.value as "mock" | "gemini")}
                          className="rounded-md border border-indigo-300 bg-white px-2 py-1 font-normal"
                        >
                          <option value="mock">Mock (no external call)</option>
                          <option value="gemini">Gemini</option>
                        </select>
                      </label>
                      {automatedAiProvider === "gemini" && (
                        <p className="max-w-xl text-xs text-amber-800">
                          {GEMINI_BROWSER_KEY_WARNING} {getGeminiBrowserApiKey() ? "A key is configured for this browser." : "No key is currently configured."}
                        </p>
                      )}
                    </div>
                  )}
                  <label className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-950">
                    <input
                      type="checkbox"
                      checked={automatedRoomDiscoveryEnabled}
                      onChange={(event) => setAutomatedRoomDiscoveryEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-indigo-300"
                    />
                    Also run Gemini page-level room discovery (independent of OCR labels)
                  </label>
                  {automatedRoomDiscoveryEnabled && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-indigo-900">
                      <label className="flex items-center gap-2">
                        AI provider
                        <select
                          value={automatedRoomDiscoveryProvider}
                          onChange={(event) => setAutomatedRoomDiscoveryProvider(event.target.value as "mock" | "gemini")}
                          className="rounded-md border border-indigo-300 bg-white px-2 py-1 font-normal"
                        >
                          <option value="mock">Mock (no external call)</option>
                          <option value="gemini">Gemini</option>
                        </select>
                      </label>
                      {automatedRoomDiscoveryProvider === "gemini" && (
                        <p className="max-w-xl text-xs text-amber-800">
                          {GEMINI_BROWSER_KEY_WARNING} {getGeminiBrowserApiKey() ? "A key is configured for this browser." : "No key is currently configured."}
                        </p>
                      )}
                    </div>
                  )}
                  <label className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-950">
                    <input
                      type="checkbox"
                      checked={automatedDimensionReviewEnabled}
                      onChange={(event) => setAutomatedDimensionReviewEnabled(event.target.checked)}
                      className="h-4 w-4 rounded border-indigo-300"
                    />
                    Also run Gemini dimension review for ambiguous rooms only
                  </label>
                  {automatedDimensionReviewEnabled && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-indigo-900">
                      <label className="flex items-center gap-2">
                        AI provider
                        <select
                          value={automatedDimensionReviewProvider}
                          onChange={(event) => setAutomatedDimensionReviewProvider(event.target.value as "mock" | "gemini")}
                          className="rounded-md border border-indigo-300 bg-white px-2 py-1 font-normal"
                        >
                          <option value="mock">Mock (no external call)</option>
                          <option value="gemini">Gemini</option>
                        </select>
                      </label>
                      {automatedDimensionReviewProvider === "gemini" && (
                        <p className="max-w-xl text-xs text-amber-800">
                          {GEMINI_BROWSER_KEY_WARNING} {getGeminiBrowserApiKey() ? "A key is configured for this browser." : "No key is currently configured."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleAnalyzeAllPlans()}
                  disabled={automatedStatus === "running"}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {automatedStatus === "running" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Layers size={17} aria-hidden="true" />}
                  {automatedStatus === "running" ? "Analyzing all pages..." : "Analyze All Plans"}
                </button>
              </div>

              {automatedStatus === "running" && automatedProgress && (
                <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-indigo-950">
                    <span>Page {automatedProgress.currentPage} of {automatedProgress.totalPages || pageCount}</span>
                    <span>{automatedProgress.roomsDiscovered} room(s) discovered</span>
                  </div>
                  <p className="mt-1 text-sm text-indigo-900">{automatedProgress.message}</p>
                  {automatedProgress.ocrProgress && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="h-full bg-indigo-600 transition-all"
                        style={{ width: `${Math.round(automatedProgress.ocrProgress.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {automatedError && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{automatedError}</span>
                </div>
              )}

              {automatedAnalysis && (
                <div className="mt-4 rounded-xl border-2 border-emerald-400 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      <ListChecks size={18} className="text-emerald-700" aria-hidden="true" />
                      Final Room Review
                    </h3>
                    <div className="flex gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span>{roomReviewCounts.accepted} accepted</span>
                      <span>{roomReviewCounts.pending} pending</span>
                      <span>{roomReviewCounts.rejected} rejected</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Review each automatically detected room below. Edits here are local to this browser session only
                    - nothing is saved, and no project rooms are created yet.
                  </p>

                  {automatedAnalysis.finalRooms.length === 0 && (
                    <p className="mt-3 text-sm text-slate-500">No final rooms were produced by this analysis.</p>
                  )}

                  <ul className="mt-4 space-y-3">
                    {automatedAnalysis.finalRooms.map((room) => {
                      const reviewState = roomReviews[room.id];
                      if (!reviewState) return null;
                      const needsReview = roomNeedsReview(room);
                      return (
                        <li
                          key={room.id}
                          className={
                            "rounded-lg border p-3 "
                            + (reviewState.decision === "rejected"
                              ? "border-slate-200 bg-slate-50 opacity-60"
                              : reviewState.decision === "accepted"
                                ? "border-emerald-300 bg-emerald-50/40"
                                : needsReview
                                  ? "border-amber-300 bg-amber-50/40"
                                  : "border-slate-200 bg-white")
                          }
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <label className="block text-xs font-semibold uppercase text-slate-500">Room name</label>
                              <input
                                type="text"
                                value={reviewState.name}
                                onChange={(event) => updateRoomReviewField(room.id, { name: event.target.value })}
                                disabled={reviewState.decision === "rejected"}
                                className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <p className="mt-1 text-xs text-slate-500">Page {room.pageNumber} · confidence {Math.round(room.confidence * 100)}%</p>
                            </div>
                            <span className={
                              "shrink-0 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide "
                              + (reviewState.decision === "accepted"
                                ? "bg-emerald-100 text-emerald-800"
                                : reviewState.decision === "rejected"
                                  ? "bg-slate-200 text-slate-600"
                                  : needsReview
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800")
                            }>
                              {reviewState.decision === "accepted"
                                ? "accepted"
                                : reviewState.decision === "rejected"
                                  ? "rejected"
                                  : needsReview
                                    ? "review required"
                                    : "ready"}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold uppercase text-slate-500">Horizontal dimension</label>
                              <input
                                type="text"
                                value={reviewState.horizontalText}
                                onChange={(event) => updateRoomReviewField(room.id, { horizontalText: event.target.value })}
                                disabled={reviewState.decision === "rejected"}
                                placeholder="No horizontal dimension found"
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <p className="mt-1 text-xs text-slate-500">Source: {room.dimensionReview.recommendation.horizontalSource}</p>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold uppercase text-slate-500">Vertical dimension</label>
                              <input
                                type="text"
                                value={reviewState.verticalText}
                                onChange={(event) => updateRoomReviewField(room.id, { verticalText: event.target.value })}
                                disabled={reviewState.decision === "rejected"}
                                placeholder="No vertical dimension found"
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <p className="mt-1 text-xs text-slate-500">Source: {room.dimensionReview.recommendation.verticalSource}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => acceptRoomReview(room.id)}
                              disabled={reviewState.decision === "accepted"}
                              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} aria-hidden="true" /> Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectRoomReview(room.id)}
                              disabled={reviewState.decision === "rejected"}
                              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle size={14} aria-hidden="true" /> Reject / Remove
                            </button>
                            {reviewState.decision !== "pending" && (
                              <button
                                type="button"
                                onClick={() => restoreRoomReview(room.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Undo2 size={14} aria-hidden="true" /> Undo
                              </button>
                            )}
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Pencil size={12} aria-hidden="true" /> Name and dimensions above are editable
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {automatedAnalysis && (
                <div className="mt-4 rounded-xl border-2 border-sky-400 bg-white p-4 shadow-sm">
                  <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                    <FileCheck2 size={18} className="text-sky-700" aria-hidden="true" />
                    Converted RoomInput Preview
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Deterministic preview of the <code>RoomInput</code> objects that would be created from the
                    Accepted rooms above, using the app&apos;s existing room-input structure, defaults, and
                    validation. Nothing here is saved or added to a project yet.
                  </p>

                  {convertedRoomInputs.length === 0 && (
                    <p className="mt-3 text-sm text-slate-500">
                      No rooms are Accepted yet. Accept a room in Final Room Review above to preview its RoomInput.
                    </p>
                  )}

                  <ul className="mt-4 space-y-3">
                    {convertedRoomInputs.map((converted) => (
                      <li
                        key={converted.roomInput.id}
                        className={
                          "rounded-lg border p-3 "
                          + (converted.reviewRequired ? "border-amber-300 bg-amber-50/40" : "border-emerald-300 bg-emerald-50/40")
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{converted.roomInput.name || "(unnamed room)"}</span>
                          <span className="text-xs text-slate-500">page {converted.pageNumber}</span>
                          <span className={
                            "rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide "
                            + (converted.reviewRequired ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")
                          }>
                            {converted.reviewRequired ? "review required" : "valid"}
                          </span>
                        </div>

                        <dl className="mt-2 grid gap-1.5 text-xs text-slate-700 sm:grid-cols-3">
                          <div><dt className="font-semibold uppercase text-slate-500">length_m</dt><dd>{converted.roomInput.length_m.toFixed(3)}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">width_m</dt><dd>{converted.roomInput.width_m.toFixed(3)}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">height_m</dt><dd>{converted.roomInput.height_m.toFixed(3)}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">exteriorLen_m</dt><dd>{converted.roomInput.exteriorLen_m}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">windowArea_m2</dt><dd>{converted.roomInput.windowArea_m2}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">doorArea_m2</dt><dd>{converted.roomInput.doorArea_m2}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">installMethod</dt><dd>{converted.roomInput.installMethod}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">setpointC</dt><dd>{converted.roomInput.setpointC}</dd></div>
                          <div><dt className="font-semibold uppercase text-slate-500">floorCover</dt><dd>{converted.roomInput.floorCover}</dd></div>
                        </dl>

                        <p className="mt-2 text-xs text-slate-600">
                          Parsed horizontal: {converted.parsedHorizontal
                            ? `${converted.parsedHorizontal.feet}'-${converted.parsedHorizontal.inches}" (${converted.parsedHorizontal.meters.toFixed(3)} m)`
                            : "could not be parsed"} ·{" "}
                          Parsed vertical: {converted.parsedVertical
                            ? `${converted.parsedVertical.feet}'-${converted.parsedVertical.inches}" (${converted.parsedVertical.meters.toFixed(3)} m)`
                            : "could not be parsed"}
                        </p>

                        {converted.reviewReasons.length > 0 && (
                          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                            {converted.reviewReasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {automatedAnalysis && (
                <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Analysis complete</h3>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Pages</dt><dd>{automatedAnalysis.summary.totalPages}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Pages analyzed</dt><dd>{automatedAnalysis.summary.analyzedPages}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Pages skipped</dt><dd>{automatedAnalysis.summary.skippedPages}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Room labels found</dt><dd>{automatedAnalysis.summary.roomLabelsFound}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Crops generated</dt><dd>{automatedAnalysis.summary.cropsGenerated}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Ready / Review / Insufficient</dt><dd>{automatedAnalysis.summary.ready} / {automatedAnalysis.summary.review} / {automatedAnalysis.summary.insufficient}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Likely rooms</dt><dd>{automatedAnalysis.summary.likelyRoomCandidates}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Possible rooms</dt><dd>{automatedAnalysis.summary.possibleRoomCandidates}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Rejected labels</dt><dd>{automatedAnalysis.summary.rejectedCandidates}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Duplicates removed</dt><dd>{automatedAnalysis.summary.duplicatesRemoved}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Gemini review</dt><dd>{automatedAnalysis.summary.aiReviewEnabled ? "Enabled" : "Not run"}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Gemini confirmed rooms</dt><dd>{automatedAnalysis.summary.aiConfirmedRooms}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Gemini needs review</dt><dd>{automatedAnalysis.summary.aiNeedsReview}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Gemini rejected (not a room)</dt><dd>{automatedAnalysis.summary.aiRejectedNotRoom}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">OCR-pipeline crops</dt><dd>{automatedAnalysis.summary.ocrPipelineCropsGenerated}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Room discovery</dt><dd>{automatedAnalysis.summary.roomDiscoveryEnabled ? "Enabled" : "Not run"}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Discovered rooms (raw)</dt><dd>{automatedAnalysis.summary.discoveredRoomsTotal}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Discovered rooms (valid)</dt><dd>{automatedAnalysis.summary.discoveredRoomsValid}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Discovered suspicious names</dt><dd>{automatedAnalysis.summary.discoveredRoomsSuspicious}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Discovery duplicates removed</dt><dd>{automatedAnalysis.summary.discoveredRoomsDuplicatesRemoved}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase text-slate-500">Discovery-pipeline crops</dt><dd>{automatedAnalysis.summary.discoveryPipelineCropsGenerated}</dd></div>
                  </dl>


                  {automatedAnalysis.warnings.length > 0 && (
                    <div className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-semibold">Warnings</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {automatedAnalysis.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 space-y-4">
                    {automatedAnalysis.pages.map((page) => {
                      const roomsOnPage = automatedAnalysis.rooms.filter((room) => room.sourcePage === page.pageNumber);
                      return (
                        <div key={page.pageNumber} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-semibold text-slate-900">Page {page.pageNumber}</h4>
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {page.status === "analyzed" ? `${page.roomLabelsDetected} label(s) · ${page.cropsGenerated} crop(s)` : (page.skipReason ?? "Skipped")}
                            </span>
                          </div>
                          {page.roomLabelFilter && (
                            <details className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                              <summary className="cursor-pointer select-none font-semibold uppercase tracking-wide text-slate-500">
                                Room label filtering · {page.roomLabelFilter.summary.likelyRoom} likely ·{" "}
                                {page.roomLabelFilter.summary.possibleRoom} possible ·{" "}
                                {page.roomLabelFilter.summary.rejected} rejected ·{" "}
                                {page.roomLabelFilter.summary.duplicatesRemoved} duplicates removed
                              </summary>
                              <ul className="mt-2 space-y-1.5">
                                {page.roomLabelFilter.evaluations.map((evaluation, index) => (
                                  <li key={`${evaluation.label.text}-${index}`} className="rounded bg-white p-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-slate-900">{evaluation.label.text}</span>
                                      <span className={
                                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                        + (evaluation.isDuplicate
                                          ? "bg-slate-200 text-slate-600"
                                          : evaluation.classification === "likelyRoom"
                                            ? "bg-emerald-100 text-emerald-800"
                                            : evaluation.classification === "possibleRoom"
                                              ? "bg-amber-100 text-amber-800"
                                              : "bg-red-100 text-red-800")
                                      }>
                                        {evaluation.isDuplicate ? "duplicate" : evaluation.classification}
                                      </span>
                                      <span className="text-[10px] text-slate-500">score {evaluation.score}</span>
                                    </div>
                                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                                      {evaluation.reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                    </ul>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {page.candidateReviews && page.candidateReviews.length > 0 && (
                            <details className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                              <summary className="cursor-pointer select-none font-semibold uppercase tracking-wide text-slate-500">
                                Gemini candidate review ·{" "}
                                {page.candidateReviews.filter((review) => review.aiClassification === "confirmedRoom").length} confirmed ·{" "}
                                {page.candidateReviews.filter((review) => review.aiClassification === "needsReview").length} needs review ·{" "}
                                {page.candidateReviews.filter((review) => review.aiClassification === "notARoom").length} not a room
                              </summary>
                              <ul className="mt-2 space-y-1.5">
                                {page.candidateReviews.map((review) => (
                                  <li key={review.candidateId} className="rounded bg-white p-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-slate-900">{review.labelText}</span>
                                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                        deterministic: {review.deterministicClassification} (score {review.deterministicScore})
                                      </span>
                                      <span className={
                                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                        + (review.aiClassification === "confirmedRoom"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : review.aiClassification === "needsReview"
                                            ? "bg-amber-100 text-amber-800"
                                            : review.aiClassification === "notARoom"
                                              ? "bg-red-100 text-red-800"
                                              : "bg-slate-200 text-slate-600")
                                      }>
                                        {review.aiClassification ? `gemini: ${review.aiClassification}` : "gemini: not reviewed"}
                                        {review.aiConfidence !== null ? ` (${Math.round(review.aiConfidence * 100)}%)` : ""}
                                      </span>
                                    </div>
                                    {review.aiReason.length > 0 && (
                                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                                        {review.aiReason.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                      </ul>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {page.roomDiscovery && (
                            <details className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                              <summary className="cursor-pointer select-none font-semibold uppercase tracking-wide text-slate-500">
                                Gemini room discovery ({page.roomDiscovery.provider}) ·{" "}
                                {page.roomDiscovery.summary.total} raw ·{" "}
                                {page.roomDiscovery.summary.valid} valid ·{" "}
                                {page.roomDiscovery.summary.invalid} invalid ·{" "}
                                {page.roomDiscovery.summary.suspicious} suspicious name(s) ·{" "}
                                {page.roomDiscovery.summary.duplicatesRemoved} duplicates removed ·{" "}
                                {page.roomDiscovery.summary.cropsGenerated} crop(s) generated
                              </summary>
                              <ul className="mt-2 space-y-1.5">
                                {page.roomDiscovery.rooms.map((room) => (
                                  <li key={room.id} className="rounded bg-white p-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-slate-900">{room.normalizedName}</span>
                                      {room.rawName !== room.normalizedName && (
                                        <span className="text-[10px] text-slate-500">(raw: "{room.rawName}")</span>
                                      )}
                                      <span className={
                                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                        + (room.isDuplicate
                                          ? "bg-slate-200 text-slate-600"
                                          : !room.valid
                                            ? "bg-red-100 text-red-800"
                                            : room.suspiciousPartialName || room.reviewRequired
                                              ? "bg-amber-100 text-amber-800"
                                              : "bg-emerald-100 text-emerald-800")
                                      }>
                                        {room.isDuplicate ? "duplicate" : room.valid ? (room.reviewRequired ? "valid, review required" : "valid") : "invalid"}
                                      </span>
                                      <span className="text-[10px] text-slate-500">confidence {Math.round(room.confidence * 100)}%</span>
                                    </div>
                                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                                      {room.evidence.map((reason, reasonIndex) => <li key={`evidence-${reasonIndex}`}>{reason}</li>)}
                                      {room.validationReasons.map((reason, reasonIndex) => <li key={`validation-${reasonIndex}`}>{reason}</li>)}
                                    </ul>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {roomsOnPage.length > 0 && (
                            <ul className="mt-3 space-y-2">
                              {roomsOnPage.map((room) => (
                                <li key={room.id} className="flex items-start gap-2 rounded-md bg-slate-50 p-2 text-sm">
                                  {room.status === "ready" && <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />}
                                  {room.status === "review" && <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />}
                                  {room.status === "insufficient" && <XCircle size={17} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />}
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-slate-900">{room.roomName}</span>
                                    <span className={
                                      "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                      + (room.source === "gemini-discovery" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800")
                                    }>
                                      {room.source === "gemini-discovery" ? "gemini discovery" : "ocr deterministic"}
                                    </span>
                                    <span className="ml-2 text-xs font-semibold uppercase text-slate-500">{room.status}</span>
                                    {room.source === "ocr-deterministic" ? (
                                      <p className="mt-1 text-xs text-slate-600">
                                        Label confidence {room.labelConfidence}% ({room.labelClassification}) ·{" "}
                                        filter: {room.filterClassification} (score {room.filterScore}) ·{" "}
                                        {room.aiClassification ? `gemini: ${room.aiClassification}` : "gemini: not reviewed"} ·{" "}
                                        {room.nearbyDimensionCandidates.length} nearby dimension candidate(s)
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-xs text-slate-600">
                                        Gemini confidence {room.discoveryConfidence !== undefined ? Math.round(room.discoveryConfidence * 100) : "?"}% ·{" "}
                                        {room.discoverySuspiciousPartialName ? "suspicious name flagged" : "name passed fragment check"} ·{" "}
                                        {room.discoveryReviewRequired ? "review required" : "no review flag"} ·{" "}
                                        {room.nearbyDimensionCandidates.length} nearby dimension candidate(s)
                                      </p>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <h4 className="font-semibold text-slate-900">Final Merged Rooms</h4>
                    <dl className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
                      <div><dt className="font-semibold uppercase text-slate-500">Final room count</dt><dd>{automatedAnalysis.mergeSummary.finalRoomCount}</dd></div>
                      <div><dt className="font-semibold uppercase text-slate-500">Merged (both pipelines)</dt><dd>{automatedAnalysis.mergeSummary.merged}</dd></div>
                      <div><dt className="font-semibold uppercase text-slate-500">OCR-only</dt><dd>{automatedAnalysis.mergeSummary.ocrOnly}</dd></div>
                      <div><dt className="font-semibold uppercase text-slate-500">Gemini-only</dt><dd>{automatedAnalysis.mergeSummary.geminiOnly}</dd></div>
                      <div><dt className="font-semibold uppercase text-slate-500">Name conflicts</dt><dd>{automatedAnalysis.mergeSummary.nameConflicts}</dd></div>
                      <div><dt className="font-semibold uppercase text-slate-500">Location conflicts</dt><dd>{automatedAnalysis.mergeSummary.locationConflicts}</dd></div>
                      <div><dt className="font-semibold uppercase text-slate-500">Duplicate crops avoided</dt><dd>{automatedAnalysis.mergeSummary.duplicateCropsAvoided}</dd></div>
                    </dl>
                    {automatedAnalysis.finalRooms.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {automatedAnalysis.finalRooms.map((room) => (
                          <li key={room.id} className="flex items-start gap-2 rounded-md bg-white p-2 text-sm">
                            {room.status === "ready" && <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />}
                            {room.status === "review" && <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />}
                            {room.status === "insufficient" && <XCircle size={17} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />}
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-900">{room.roomName}</span>
                              <span className="ml-2 text-xs text-slate-500">page {room.pageNumber}</span>
                              <span className="ml-2 text-xs text-slate-500">confidence {Math.round(room.confidence * 100)}%</span>
                              <span className={
                                "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                + (room.mergeStatus === "merged"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : room.mergeStatus === "gemini-only"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-sky-100 text-sky-800")
                              }>
                                {room.mergeStatus} · {room.sources.join(" + ")}
                              </span>
                              <span className={
                                "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                + (room.reviewStatus === "ok" ? "bg-slate-200 text-slate-600" : "bg-red-100 text-red-800")
                              }>
                                {room.reviewStatus === "ok" ? "no conflict" : room.reviewStatus}
                              </span>
                              {room.alternateNames.length > 0 && (
                                <p className="mt-1 text-xs text-slate-600">Alternate name(s): {room.alternateNames.join(", ")}</p>
                              )}
                              {room.reviewReasons.length > 0 && (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                                  {room.reviewReasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                </ul>
                              )}
                              <details className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                                <summary className="cursor-pointer select-none font-semibold uppercase tracking-wide text-slate-500">
                                  Dimension association ·{" "}
                                  {room.dimensionAssociation.reviewRequired ? "review required" : "ok"} ·{" "}
                                  {room.dimensionAssociation.summary.totalConsidered} candidate(s) considered
                                </summary>
                                <div className="mt-2 space-y-2">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded bg-white p-1.5">
                                      <p className="font-semibold text-slate-900">Deterministic primary horizontal</p>
                                      {room.dimensionAssociation.primaryHorizontal ? (
                                        <>
                                          <p>{room.dimensionAssociation.primaryHorizontal.candidate.originalText} · score {Math.round(room.dimensionAssociation.primaryHorizontal.score)}</p>
                                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                                            {room.dimensionAssociation.primaryHorizontal.reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                          </ul>
                                        </>
                                      ) : <p className="text-slate-500">None found.</p>}
                                    </div>
                                    <div className="rounded bg-white p-1.5">
                                      <p className="font-semibold text-slate-900">Deterministic primary vertical</p>
                                      {room.dimensionAssociation.primaryVertical ? (
                                        <>
                                          <p>{room.dimensionAssociation.primaryVertical.candidate.originalText} · score {Math.round(room.dimensionAssociation.primaryVertical.score)}</p>
                                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                                            {room.dimensionAssociation.primaryVertical.reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                          </ul>
                                        </>
                                      ) : <p className="text-slate-500">None found.</p>}
                                    </div>
                                  </div>
                                  {room.dimensionAssociation.additionalDimensions.length > 0 && (
                                    <div>
                                      <p className="font-semibold text-slate-900">Additional / ambiguous dimension(s)</p>
                                      <ul className="mt-1 space-y-1">
                                        {room.dimensionAssociation.additionalDimensions.map((entry, entryIndex) => (
                                          <li key={entryIndex} className="rounded bg-white p-1.5">
                                            <span>{entry.candidate.originalText} · {entry.orientation} · {entry.relation} · score {Math.round(entry.score)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {room.dimensionAssociation.reviewReasons.length > 0 && (
                                    <ul className="list-disc space-y-0.5 pl-4 text-amber-800">
                                      {room.dimensionAssociation.reviewReasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                    </ul>
                                  )}

                                  <div className="rounded bg-white p-1.5">
                                    <p className="font-semibold text-slate-900">
                                      Gemini-reviewed dimensions ·{" "}
                                      <span className={
                                        room.dimensionReview.status === "reviewed"
                                          ? "text-emerald-700"
                                          : room.dimensionReview.status === "failed"
                                            ? "text-red-700"
                                            : "text-slate-500"
                                      }>
                                        {room.dimensionReview.status}
                                      </span>
                                    </p>
                                    {room.dimensionReview.reason && <p className="text-slate-600">{room.dimensionReview.reason}</p>}
                                    {room.dimensionReview.status === "reviewed" && room.dimensionReview.aiReview && (
                                      <>
                                        <p className="text-slate-600">Provider: {room.dimensionReview.provider} · overall confidence {Math.round(room.dimensionReview.aiReview.confidence * 100)}%</p>
                                        <ul className="mt-1 space-y-1">
                                          {room.dimensionReview.aiReview.dimensions.map((entry, entryIndex) => (
                                            <li key={entryIndex} className="rounded bg-slate-50 p-1.5">
                                              <span className="font-medium text-slate-900">{entry.candidateId}</span>{" "}
                                              <span className={
                                                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide "
                                                + (entry.role === "rejected"
                                                  ? "bg-red-100 text-red-800"
                                                  : entry.role === "extra"
                                                    ? "bg-slate-200 text-slate-600"
                                                    : "bg-emerald-100 text-emerald-800")
                                              }>
                                                {entry.role}
                                              </span>{" "}
                                              <span className="text-[10px] text-slate-500">confidence {Math.round(entry.confidence * 100)}%</span>
                                              {entry.evidence.length > 0 && (
                                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
                                                  {entry.evidence.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                                </ul>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                        {(room.dimensionReview.aiReview.missingInformation.length > 0 || room.dimensionReview.aiReview.warnings.length > 0) && (
                                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
                                            {room.dimensionReview.aiReview.missingInformation.map((reason, reasonIndex) => <li key={`missing-${reasonIndex}`}>{reason}</li>)}
                                            {room.dimensionReview.aiReview.warnings.map((reason, reasonIndex) => <li key={`warning-${reasonIndex}`}>{reason}</li>)}
                                          </ul>
                                        )}
                                      </>
                                    )}
                                  </div>

                                  <div className="rounded bg-white p-1.5">
                                    <p className="font-semibold text-slate-900">Final recommended dimensions</p>
                                    <p>
                                      Horizontal: {room.dimensionReview.recommendation.primaryHorizontal?.candidate.originalText ?? "none"}{" "}
                                      <span className="text-[10px] uppercase text-slate-500">({room.dimensionReview.recommendation.horizontalSource})</span>
                                    </p>
                                    <p>
                                      Vertical: {room.dimensionReview.recommendation.primaryVertical?.candidate.originalText ?? "none"}{" "}
                                      <span className="text-[10px] uppercase text-slate-500">({room.dimensionReview.recommendation.verticalSource})</span>
                                    </p>
                                    {room.dimensionReview.disagreement && (
                                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
                                        {room.dimensionReview.disagreementReasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </details>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
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
                    onChange={(event) => {
                      setSelectedPage(Number(event.target.value));
                      setOcrResult(null);
                      setOcrProgress(null);
                      setOcrStatus("idle");
                      setSelectedRoomLabelIndex(null);
                      setRoomCrop(null);
                    }}
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
              <canvas ref={analysisCanvasRef} className="hidden" aria-hidden="true" />
              {renderInfo && textDiagnostics && (
                <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3"><span className="block font-semibold text-slate-900">Rendered size</span>{renderInfo.width} × {renderInfo.height}px</div>
                  <div className="rounded-lg bg-white p-3"><span className="block font-semibold text-slate-900">OCR analysis size</span>{analysisRenderInfo ? `${analysisRenderInfo.width} × ${analysisRenderInfo.height}px` : "Loading"}</div>
                  <div className="rounded-lg bg-white p-3"><span className="block font-semibold text-slate-900">Text items</span>{textDiagnostics.nonEmptyTextItemCount} readable of {textDiagnostics.textItemCount}</div>
                </div>
              )}
              {textDiagnostics?.preview && (
                <details className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-800">Text-layer preview</summary>
                  <p className="mt-2 break-words">{textDiagnostics.preview}</p>
                </details>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => void handleRunOcr()}
                  disabled={ocrStatus === "running"}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ocrStatus === "running" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <ScanSearch size={17} aria-hidden="true" />}
                  {ocrStatus === "running" ? "Running OCR..." : "Run OCR"}
                </button>
                {ocrStatus === "running" && ocrProgress && (
                  <span className="text-sm text-slate-600">
                    {ocrProgress.status} ({Math.round(ocrProgress.progress * 100)}%)
                  </span>
                )}
                {ocrStatus === "complete" && ocrResult && (
                  <span className="text-sm font-semibold text-emerald-700">
                    {ocrResult.observations.length} text observations detected
                  </span>
                )}
              </div>
              {ocrResult && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                    <span><strong className="text-slate-900">Observations:</strong> {ocrResult.observations.length}</span>
                    <span><strong className="text-slate-900">Average OCR confidence:</strong> {ocrResult.confidence}%</span>
                    <span><strong className="text-slate-900">Room labels:</strong> {planAnalysis?.roomLabels.length ?? 0}</span>
                  </div>
                  <div className="mt-3 max-h-48 overflow-auto rounded-md bg-slate-50 p-3">
                    {ocrResult.observations.length === 0 ? (
                      <p className="text-sm text-slate-500">No text observations were detected on this page.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {ocrResult.observations.slice(0, 30).map((observation, index) => (
                          <li key={`${observation.text}-${index}`} className="flex items-start justify-between gap-4 border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                            <span className="min-w-0 break-words font-medium text-slate-800">{observation.text}</span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {observation.confidence}% · ({Math.round(observation.bbox.x0)}, {Math.round(observation.bbox.y0)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {ocrResult.observations.length > 30 && (
                    <p className="mt-2 text-xs text-slate-500">Showing the first 30 observations. Full OCR results remain local to this page.</p>
                  )}
                  {planAnalysis && planAnalysis.roomLabels.length > 0 && (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <h3 className="text-sm font-semibold text-slate-900">Room label candidates</h3>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="flex min-w-56 flex-col gap-1 text-xs font-semibold text-slate-600">
                          Select a label for a crop
                          <select
                            value={selectedRoomLabelIndex ?? ""}
                            onChange={(event) => {
                              setSelectedRoomLabelIndex(event.target.value === "" ? null : Number(event.target.value));
                              setRoomCrop(null);
                              setRoomCropValidation(null);
                              setAiStatus("idle");
                              setAiError(null);
                              setAiDraft(null);
                            }}
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                          >
                            <option value="">Choose a detected room label</option>
                            {planAnalysis.roomLabels.map((label, index) => (
                              <option key={`${label.text}-${index}`} value={index}>
                                {label.text} ({label.confidence}%)
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex w-32 flex-col gap-1 text-xs font-semibold text-slate-600">
                          Padding (px)
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={cropPadding}
                            onChange={(event) => setCropPadding(Number(event.target.value) || 0)}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleGenerateRoomCrop}
                          disabled={selectedRoomLabelIndex === null}
                          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Generate room crop
                        </button>
                      </div>
                      <div className="mt-3 max-h-48 overflow-auto rounded-md bg-slate-50 p-3">
                        <ul className="space-y-2 text-sm">
                          {planAnalysis.roomLabels.slice(0, 30).map((label, index) => (
                            <li key={`${label.text}-${index}`} className="flex items-start justify-between gap-4 border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                              <span className="font-medium text-slate-800">{label.text}</span>
                              <span className="shrink-0 text-xs text-slate-500">{label.classification} · {label.confidence}% · ({Math.round(label.boundingBox.x0)}, {Math.round(label.boundingBox.y0)})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {roomCrop && (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                          <h4 className="text-sm font-semibold text-emerald-950">Generated high-resolution crop</h4>
                          <img src={roomCrop.dataUrl} alt={`Crop for ${roomCrop.metadata.roomLabelText}`} className="mt-3 max-h-[min(60vh,600px)] max-w-full overflow-auto rounded border border-slate-300 bg-white" />
                          <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div><dt className="font-semibold text-slate-900">Label</dt><dd>{roomCrop.metadata.roomLabelText} ({roomCrop.metadata.roomLabelConfidence}%)</dd></div>
                            <div><dt className="font-semibold text-slate-900">Source page</dt><dd>{roomCrop.metadata.sourcePage}</dd></div>
                            <div><dt className="font-semibold text-slate-900">Source analysis image</dt><dd>{roomCrop.metadata.sourceAnalysisImageDimensions.width} × {roomCrop.metadata.sourceAnalysisImageDimensions.height}px</dd></div>
                            <div><dt className="font-semibold text-slate-900">Crop box</dt><dd>({roomCrop.metadata.cropBoundingBox.x0}, {roomCrop.metadata.cropBoundingBox.y0}) to ({roomCrop.metadata.cropBoundingBox.x1}, {roomCrop.metadata.cropBoundingBox.y1})</dd></div>
                          </dl>
                          {roomCropValidation && (
                            <div className={`mt-4 rounded-lg border p-3 ${roomCropValidation.status === "ready" ? "border-emerald-300 bg-emerald-100/70" : roomCropValidation.status === "review" ? "border-amber-300 bg-amber-100/70" : "border-red-300 bg-red-100/70"}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="text-sm font-semibold text-slate-900">Crop validation: {roomCropValidation.status}</h5>
                                <span className="text-xs font-semibold text-slate-700">{roomCropValidation.valid ? "Suitable for next targeted AI experiment" : "Review or adjust crop"}</span>
                              </div>
                              <div className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                                <span>Selected label inside: {roomCropValidation.selectedLabelInsideCrop ? "yes" : "no"}</span>
                                <span>Selected text found: {roomCropValidation.selectedLabelTextFound ? "yes" : "no"}</span>
                                <span>Other labels in crop: {roomCropValidation.otherRoomLabelsInCrop}</span>
                                <span>Dimension candidates in/near crop: {roomCropValidation.dimensionCandidatesInCrop}</span>
                                <span>Crop size: {roomCropValidation.cropWidth} × {roomCropValidation.cropHeight}px</span>
                                <span>Padding: {roomCropValidation.paddingUsed}px</span>
                              </div>
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                                {roomCropValidation.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
                              </ul>
                            </div>
                          )}
                          <div className="mt-4 border-t border-emerald-200 pt-4">
                            <div className="mb-3 flex flex-wrap items-end gap-3">
                              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                AI provider
                                <select
                                  value={aiProvider}
                                  onChange={(event) => {
                                    setAiProvider(event.target.value as "mock" | "gemini");
                                    setAiDraft(null);
                                    setAiStatus("idle");
                                    setAiError(null);
                                  }}
                                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800"
                                >
                                  <option value="mock">Mock browser provider</option>
                                  <option value="gemini">Gemini browser provider</option>
                                </select>
                              </label>
                              {aiProvider === "gemini" && <p className="max-w-xl text-xs text-amber-800">{GEMINI_BROWSER_KEY_WARNING} {getGeminiBrowserApiKey() ? "A key is configured for this browser." : "No key is currently configured."}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleAnalyzeRoomWithAi()}
                              disabled={!roomCropValidation || roomCropValidation.status === "insufficient" || aiStatus === "running"}
                              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {aiStatus === "running" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <ScanSearch size={17} aria-hidden="true" />}
                              {aiStatus === "running" ? "Analyzing room crop..." : "Analyze room with AI"}
                            </button>
                            {roomCropValidation?.status === "insufficient" && <p className="mt-2 text-xs text-red-800">AI analysis is disabled until this crop has sufficient deterministic validation. Select another label or increase padding.</p>}
                            {aiStatus === "running" && <p className="mt-2 text-xs text-slate-700">Browser mock provider running. No external AI call is being made.</p>}
                            {aiError && <p className="mt-2 text-xs text-red-800">{aiError}</p>}
                          </div>
                          {aiDraft && (
                            <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h5 className="font-semibold text-slate-900">Draft room analysis</h5>
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Draft · review required</span>
                              </div>
                              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                                <span><strong>Detected room:</strong> {aiDraft.room.name ?? "Unclear"}</span>
                                <span><strong>Confidence:</strong> {Math.round(aiDraft.room.confidence * 100)}%</span>
                                <span><strong>Provider:</strong> {aiDraft.provider}</span>
                                <span><strong>Source page:</strong> {aiDraft.room.sourcePage}</span>
                              </div>
                              {aiDraft.room.dimensions.length > 0 && <div className="mt-3"><h6 className="text-sm font-semibold text-slate-900">Draft dimensions</h6><ul className="mt-2 space-y-2 text-sm">{aiDraft.room.dimensions.map((dimension, index) => <li key={`${dimension.rawText}-${index}`} className="flex items-center justify-between gap-3 rounded bg-slate-50 p-2"><span>{dimension.rawText} {dimension.normalizedText ? `→ ${dimension.normalizedText}` : ""} · {dimension.orientation}</span><span className="text-xs text-slate-500">{Math.round(dimension.confidence * 100)}%</span></li>)}</ul></div>}
                              <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><h6 className="text-xs font-semibold uppercase text-slate-500">Evidence</h6><ul className="mt-1 list-disc pl-4 text-xs text-slate-700">{aiDraft.room.evidence.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div><div><h6 className="text-xs font-semibold uppercase text-slate-500">Warnings / missing</h6><ul className="mt-1 list-disc pl-4 text-xs text-slate-700">{[...aiDraft.room.warnings, ...aiDraft.room.missingInformation].map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div></div>
                              <p className="mt-4 text-xs text-amber-900">This draft is local review data only. It does not create or update RoomInput, projects, calculations, or persistence.</p>
                            </div>
                          )}
                          <p className="mt-3 text-xs text-emerald-900">Crop generation preserves the OCR label evidence only. Dimensions are not associated with this room.</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1">Candidates: {dimensionSummary.total}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">Before spatial: H {preSpatialDimensionSummary.high} · M {preSpatialDimensionSummary.medium} · U {preSpatialDimensionSummary.uncertain} · R {preSpatialDimensionSummary.rejected}</span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">High: {dimensionSummary.high}</span>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">Medium: {dimensionSummary.medium}</span>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Uncertain: {dimensionSummary.uncertain}</span>
                      <span className="rounded-full bg-red-100 px-3 py-1 text-red-800">Rejected: {dimensionSummary.rejected}</span>
                    </div>
                    {dimensionCandidates.length > 0 && (
                      <div className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-50 p-3">
                        <ul className="space-y-2 text-sm">
                          {dimensionCandidates.slice(0, 30).map((candidate, index) => (
                            <li key={`${candidate.originalText}-${index}`} className="border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                              <div className="flex items-start justify-between gap-4">
                                <span className="font-medium text-slate-800">
                                  {candidate.originalText}
                                  {candidate.normalizedText ? ` → ${candidate.normalizedText} (${candidate.decimalFeet} ft)` : ""}
                                </span>
                                <span className="shrink-0 text-xs text-slate-500">{candidate.classification} · {candidate.confidence}%</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                ({Math.round(candidate.boundingBox.x0)}, {Math.round(candidate.boundingBox.y0)}) · {candidate.reason} {candidate.spatialEvidence.reason} · line scores {candidate.spatialEvidence.horizontalLineScore}/{candidate.spatialEvidence.verticalLineScore}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {state === "analyzing" && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              <LoaderCircle size={22} className="animate-spin" aria-hidden="true" />
              <div><p className="font-semibold">Inspecting PDF page {selectedPage}</p><p className="mt-1">Reading the document and rendering the selected page locally. No AI or API is being called.</p></div>
            </div>
          )}

          {state === "analysisComplete" && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                <div><p className="font-semibold text-amber-950">Browser PDF inspection complete</p><p className="mt-1 text-sm text-amber-900">The document loaded successfully. Future steps may use this page image for room and dimension analysis; no AI analysis has run.</p></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[`Page ${selectedPage} rendered and inspected`, `${textDiagnostics?.nonEmptyTextItemCount ?? 0} text items found on selected page`].map((text) => <div key={text} className="rounded-lg border border-amber-200 bg-white/60 p-3 text-sm text-slate-700"><ListChecks size={17} className="mb-2 text-amber-700" aria-hidden="true" />{text}</div>)}
              </div>
              <button type="button" onClick={removeFile} className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Choose another PDF</button>
            </div>
          )}

          <div className="mt-8 flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <FileCheck2 size={20} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
            <p>Only validated RoomInput objects will eventually enter the existing project editor and calculation workflow.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
