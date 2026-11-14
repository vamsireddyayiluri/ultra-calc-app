import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileUp, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { ProjectEditor } from "../components/projects/ProjectEditor";
import type { ProjectSettings, RoomInput } from "../models/projectTypes";
import { useProjectSummary } from "../hooks/useProjectSummary";
import { loadPdfDocument } from "../plan-import/browser/pdfDocument";
import { renderPdfPage } from "../plan-import/browser/pdfRenderer";
import { createDraftProject, createEmptyRoom } from "../utils/projectFactory";

export default function ManualPlanEntryPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [project, setProject] = useState(() => createDraftProject({ idPrefix: "manual-pdf" }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;
    let cancelled = false;
    renderPdfPage(pdfDocument, page, canvasRef.current, { maxWidth: 1000 * zoom })
      .catch((renderError) => {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : "We couldn't display this page. Try a different page or re-upload the PDF.");
      });
    return () => { cancelled = true; };
  }, [pdfDocument, page, zoom]);

  const selectPdf = async (candidate: File | undefined) => {
    if (!candidate) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF files only. Choose an architectural plan saved as a PDF.");
      return;
    }
    setError(null);
    try {
      const loaded = await loadPdfDocument(await candidate.arrayBuffer());
      setFile(candidate);
      setPdfDocument(loaded.document);
      setPageCount(loaded.pageCount);
      setPage(1);
      setZoom(1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We couldn't open this PDF. Make sure the file isn't corrupted and try again.");
    }
  };

  const updateProject = (patch: Partial<ProjectSettings>) => setProject((current) => ({ ...current, ...patch }));
  const updateRoom = (id: string, patch: Partial<RoomInput>) => setProject((current) => ({
    ...current,
    rooms: current.rooms.map((room) => room.id === id || room.name === id ? { ...room, ...patch } : room),
  }));
  const removeRoom = (id: string) => setProject((current) => ({
    ...current,
    rooms: current.rooms.filter((room) => room.id !== id && room.name !== id),
  }));
  const addRoom = () => setProject((current) => ({
    ...current,
    rooms: [...current.rooms, createEmptyRoom(`Room ${current.rooms.length + 1}`)],
  }));

  const summary = useProjectSummary(project.rooms, project);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1600px] py-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigate("/project/import")} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} aria-hidden="true" /> Back to Plan Import
          </button>
          <div className="text-right"><p className="text-sm font-semibold text-slate-900">Manual PDF-assisted entry</p><p className="text-xs text-slate-500">PDF and room edits stay local until the existing save flow is used.</p></div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
          <section className="sticky top-[76px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h1 className="font-semibold text-slate-900">Plan viewer</h1><p className="text-sm text-slate-500">View the drawing while entering each room manually.</p></div>
              {file && <span className="max-w-64 truncate text-xs text-slate-500">{file.name}</span>}
            </div>
            {!pdfDocument ? (
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-6 flex min-h-56 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center hover:border-emerald-400 hover:bg-emerald-50">
                <FileUp size={30} className="text-emerald-700" aria-hidden="true" /><span className="mt-3 font-semibold text-slate-900">Choose a PDF plan</span><span className="mt-1 text-sm text-slate-600">Enter rooms yourself while viewing the plan — no automatic detection in this mode.</span>
              </button>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-md border border-slate-300 p-2 disabled:opacity-40" aria-label="Previous PDF page"><ChevronLeft size={18} /></button><span className="text-sm font-semibold text-slate-700">Page {page} of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-md border border-slate-300 p-2 disabled:opacity-40" aria-label="Next PDF page"><ChevronRight size={18} /></button></div>
                  <div className="flex items-center gap-2"><button type="button" onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.25).toFixed(2))))} className="rounded-md border border-slate-300 p-2" aria-label="Zoom out"><ZoomOut size={17} /></button><span className="w-12 text-center text-xs text-slate-600">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))} className="rounded-md border border-slate-300 p-2" aria-label="Zoom in"><ZoomIn size={17} /></button></div>
                </div>
                <div className="mt-3 max-h-[calc(100vh-254px)] overflow-auto rounded-lg bg-slate-700 p-3"><canvas ref={canvasRef} className="mx-auto block h-auto max-w-none bg-white shadow" aria-label={`PDF page ${page}`} /></div>
                <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 text-sm font-semibold text-emerald-700 hover:text-emerald-800">Replace PDF</button>
              </>
            )}
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => void selectPdf(event.target.files?.[0])} />
            {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><ProjectEditor project={project} rooms={project.rooms} onUpdateProject={updateProject} onUpdateRoom={updateRoom} onRemoveRoom={removeRoom} onAddRoom={addRoom} summary={summary} /></section>
        </div>
      </div>
    </AppLayout>
  );
}
