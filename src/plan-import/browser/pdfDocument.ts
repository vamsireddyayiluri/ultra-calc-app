import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export interface BrowserPdfDocument {
  document: PDFDocumentProxy;
  pageCount: number;
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<BrowserPdfDocument> {
  const loadingTask = getDocument({ data: new Uint8Array(data) });
  const document = await loadingTask.promise;

  return {
    document,
    pageCount: document.numPages,
  };
}
