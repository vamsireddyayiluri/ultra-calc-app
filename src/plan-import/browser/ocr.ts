import { createWorker, PSM } from "tesseract.js";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface OcrTextObservation {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface BrowserOcrResult {
  text: string;
  confidence: number;
  observations: OcrTextObservation[];
}

export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: OcrProgress) => void,
): Promise<BrowserOcrResult> {
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      onProgress?.({
        status: message.status,
        progress: Math.max(0, Math.min(1, message.progress ?? 0)),
      });
    },
  });

  try {
    // Architectural sheets contain scattered labels and dimension strings,
    // so sparse-text segmentation is a better fit than the default page mode.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      user_defined_dpi: "300",
      preserve_interword_spaces: "1",
    });

    const result = await worker.recognize(canvas, {}, { blocks: true });
    const observations = (result.data.blocks ?? [])
      .flatMap((block) => block.paragraphs)
      .flatMap((paragraph) => paragraph.lines)
      .flatMap((line) => line.words)
      .map((word) => ({
        text: word.text.trim(),
        confidence: Number(word.confidence.toFixed(1)),
        bbox: word.bbox,
      }))
      .filter((word) => word.text.length > 0);

    return {
      text: result.data.text,
      confidence: Number(result.data.confidence.toFixed(1)),
      observations,
    };
  } finally {
    await worker.terminate();
  }
}
