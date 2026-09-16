import {
  detectDimensionCandidates,
  summarizeDimensionCandidates,
  type DimensionCandidate,
  type OcrObservationInput,
} from "./dimensionCandidates";
import { detectRoomLabelCandidates, type RoomLabelCandidate } from "./roomLabels";
import {
  applySpatialDimensionContext,
  type SpatialDimensionCandidate,
} from "./spatialDimensionContext";

export type BrowserDimensionCandidate = SpatialDimensionCandidate;

export interface BrowserPlanAnalysis {
  totalOcrObservations: number;
  roomLabels: RoomLabelCandidate[];
  dimensionCandidates: BrowserDimensionCandidate[];
  preSpatialDimensionSummary: ReturnType<typeof summarizeDimensionCandidates>;
  dimensionSummary: ReturnType<typeof summarizeDimensionCandidates>;
}

export function analyzePlanObservations(
  observations: OcrObservationInput[],
  analysisCanvas: HTMLCanvasElement | null = null,
): BrowserPlanAnalysis {
  const roomLabels = detectRoomLabelCandidates(observations);
  const baseDimensions = detectDimensionCandidates(observations);
  const dimensionCandidates = applySpatialDimensionContext(analysisCanvas, baseDimensions, roomLabels);

  return {
    totalOcrObservations: observations.length,
    roomLabels,
    dimensionCandidates,
    preSpatialDimensionSummary: summarizeDimensionCandidates(baseDimensions),
    dimensionSummary: summarizeDimensionCandidates(dimensionCandidates),
  };
}
