import type { PDFDocumentProxy } from "pdfjs-dist";

export interface PdfRenderResult {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
}

export interface PdfRenderOptions {
  maxWidth?: number;
  scale?: number;
}

export async function renderPdfPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: PdfRenderOptions = {},
): Promise<PdfRenderResult> {
  const page = await document.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = options.scale ?? Math.min((options.maxWidth ?? 1200) / baseViewport.width, 2);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("The browser could not create a canvas rendering context.");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  return {
    pageNumber,
    width: canvas.width,
    height: canvas.height,
    scale,
  };
}
