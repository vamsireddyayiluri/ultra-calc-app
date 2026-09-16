import type { RoomLabelCandidate } from "../core/roomLabels";

export interface RoomCropMetadata {
  roomLabelText: string;
  roomLabelConfidence: number;
  originalLabelBoundingBox: RoomLabelCandidate["boundingBox"];
  cropBoundingBox: RoomLabelCandidate["boundingBox"];
  sourcePage: number;
  sourceAnalysisImageDimensions: {
    width: number;
    height: number;
  };
  padding: number;
}

export interface RoomCropResult {
  dataUrl: string;
  metadata: RoomCropMetadata;
}

function renderCropCanvas(
  canvas: HTMLCanvasElement,
  sourceBox: RoomLabelCandidate["boundingBox"],
  padding: number,
): { dataUrl: string; cropBox: RoomLabelCandidate["boundingBox"]; safePadding: number } {
  const safePadding = Math.max(0, Math.round(padding));
  const cropBox = {
    x0: Math.max(0, Math.floor(sourceBox.x0 - safePadding)),
    y0: Math.max(0, Math.floor(sourceBox.y0 - safePadding)),
    x1: Math.min(canvas.width, Math.ceil(sourceBox.x1 + safePadding)),
    y1: Math.min(canvas.height, Math.ceil(sourceBox.y1 + safePadding)),
  };
  const cropWidth = Math.max(1, cropBox.x1 - cropBox.x0);
  const cropHeight = Math.max(1, cropBox.y1 - cropBox.y0);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const context = cropCanvas.getContext("2d");

  if (!context) {
    throw new Error("The browser could not create a crop canvas.");
  }

  context.drawImage(
    canvas,
    cropBox.x0,
    cropBox.y0,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return { dataUrl: cropCanvas.toDataURL("image/png"), cropBox, safePadding };
}

export function createRoomCrop(
  canvas: HTMLCanvasElement,
  label: RoomLabelCandidate,
  sourcePage: number,
  padding: number,
): RoomCropResult {
  const sourceBox = label.boundingBox;
  const { dataUrl, cropBox, safePadding } = renderCropCanvas(canvas, sourceBox, padding);

  return {
    dataUrl,
    metadata: {
      roomLabelText: label.text,
      roomLabelConfidence: label.confidence,
      originalLabelBoundingBox: sourceBox,
      cropBoundingBox: cropBox,
      sourcePage,
      sourceAnalysisImageDimensions: {
        width: canvas.width,
        height: canvas.height,
      },
      padding: safePadding,
    },
  };
}

// Same crop rendering, but driven by an arbitrary bounding box (e.g. from Gemini page-level
// room discovery) instead of an OCR RoomLabelCandidate.
export function createRoomCropFromBoundingBox(
  canvas: HTMLCanvasElement,
  boundingBox: RoomLabelCandidate["boundingBox"],
  roomName: string,
  roomConfidence: number,
  sourcePage: number,
  padding: number,
): RoomCropResult {
  const { dataUrl, cropBox, safePadding } = renderCropCanvas(canvas, boundingBox, padding);

  return {
    dataUrl,
    metadata: {
      roomLabelText: roomName,
      roomLabelConfidence: roomConfidence,
      originalLabelBoundingBox: boundingBox,
      cropBoundingBox: cropBox,
      sourcePage,
      sourceAnalysisImageDimensions: {
        width: canvas.width,
        height: canvas.height,
      },
      padding: safePadding,
    },
  };
}

