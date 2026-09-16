// Pure, deterministic conversion of Gemini's discovered-room bounding boxes (pixel
// space of the downscaled image sent to Gemini) back into the high-resolution
// OCR/analysis canvas coordinate space. No browser APIs, no AI calls.
export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PixelBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalysisBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BoundingBoxConversionResult {
  analysisBoundingBox: AnalysisBoundingBox;
  scaleX: number;
  scaleY: number;
}

export function convertGeminiBoundingBoxToAnalysisSpace(
  boundingBox: PixelBoundingBox,
  geminiImageDimensions: ImageDimensions,
  analysisImageDimensions: ImageDimensions,
): BoundingBoxConversionResult {
  const scaleX = geminiImageDimensions.width > 0
    ? analysisImageDimensions.width / geminiImageDimensions.width
    : 1;
  const scaleY = geminiImageDimensions.height > 0
    ? analysisImageDimensions.height / geminiImageDimensions.height
    : 1;

  return {
    analysisBoundingBox: {
      x0: boundingBox.x * scaleX,
      y0: boundingBox.y * scaleY,
      x1: (boundingBox.x + boundingBox.width) * scaleX,
      y1: (boundingBox.y + boundingBox.height) * scaleY,
    },
    scaleX,
    scaleY,
  };
}
