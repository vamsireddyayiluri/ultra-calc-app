import type { PDFDocumentProxy } from "pdfjs-dist";

export interface PdfTextDiagnostics {
  pageNumber: number;
  textItemCount: number;
  nonEmptyTextItemCount: number;
  characterCount: number;
  preview: string;
}

export async function extractPageTextDiagnostics(
  document: PDFDocumentProxy,
  pageNumber: number,
): Promise<PdfTextDiagnostics> {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  const textItems = content.items.map((item) =>
    "str" in item && typeof item.str === "string" ? item.str : "",
  );
  const nonEmptyItems = textItems.filter((text) => text.trim().length > 0);
  const text = nonEmptyItems.join(" ").replace(/\s+/g, " ").trim();

  return {
    pageNumber,
    textItemCount: textItems.length,
    nonEmptyTextItemCount: nonEmptyItems.length,
    characterCount: text.length,
    preview: text.slice(0, 500),
  };
}
