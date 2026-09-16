// Produces a size-capped PNG of a rendered page canvas, suitable for sending to Gemini.
export interface PageReviewImage {
  dataUrl: string;
  width: number;
  height: number;
}

export function createPageReviewImage(canvas: HTMLCanvasElement, maxWidth = 1400): PageReviewImage {
  if (canvas.width <= maxWidth) {
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  }

  const scale = maxWidth / canvas.width;
  const scaledCanvas = document.createElement("canvas");
  scaledCanvas.width = Math.max(1, Math.round(canvas.width * scale));
  scaledCanvas.height = Math.max(1, Math.round(canvas.height * scale));
  const context = scaledCanvas.getContext("2d");

  if (!context) {
    throw new Error("The browser could not create a page-review canvas.");
  }

  context.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
  return { dataUrl: scaledCanvas.toDataURL("image/png"), width: scaledCanvas.width, height: scaledCanvas.height };
}
