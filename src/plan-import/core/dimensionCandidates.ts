export interface OcrObservationInput {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export type DimensionClassification = "high" | "medium" | "uncertain" | "rejected";

export interface DimensionCandidate {
  originalText: string;
  normalizedText: string | null;
  feet: number | null;
  inches: number | null;
  decimalFeet: number | null;
  confidence: number;
  boundingBox: OcrObservationInput["bbox"];
  classification: DimensionClassification;
  reason: string;
}

interface ParsedDimension {
  feet: number;
  inches: number;
  normalizedText: string;
  decimalFeet: number;
  hasFeetMark: boolean;
  hasInchesMark: boolean;
  hasSeparator: boolean;
}

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "");
}

function parseDimension(text: string): ParsedDimension | null {
  const normalized = normalizeText(text);
  const mixed = normalized.match(/^(\d{1,2})(['-])\s*(\d{1,2}(?:\.\d+)?(?:\/\d+)?)("?)$/);

  if (!mixed) return null;

  const feet = Number(mixed[1]);
  const inchText = mixed[3];
  const inches = inchText.includes("/")
    ? Number(inchText.split("/")[0]) / Number(inchText.split("/")[1])
    : Number(inchText);

  if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet > 60 || inches >= 12) {
    return null;
  }

  return {
    feet,
    inches: Number(inches.toFixed(2)),
    decimalFeet: Number((feet + inches / 12).toFixed(2)),
    normalizedText: `${feet}'-${Number.isInteger(inches) ? inches : inches.toFixed(2)}\"`,
    hasFeetMark: mixed[2] === "'",
    hasInchesMark: mixed[4] === '"',
    hasSeparator: true,
  };
}

function looksLikeDimensionCandidate(text: string): boolean {
  const normalized = normalizeText(text);
  return /\d/.test(normalized) && /[-/'"]/.test(normalized);
}

function classify(parsed: ParsedDimension | null, observation: OcrObservationInput): DimensionClassification {
  if (!parsed || observation.confidence < 20) return "rejected";
  if (parsed.hasFeetMark && parsed.hasInchesMark && observation.confidence >= 70) return "high";
  if (parsed.hasSeparator && observation.confidence >= 60) return "medium";
  return "uncertain";
}

function reasonFor(
  parsed: ParsedDimension | null,
  classification: DimensionClassification,
  observation: OcrObservationInput,
): string {
  if (!parsed) return "Does not match a plausible feet-and-inches dimension structure or exceeds plausibility limits.";
  if (classification === "high") return "Explicit feet and inches marks with sufficient OCR confidence.";
  if (classification === "medium") return "Feet-and-inches numeric structure is plausible; OCR punctuation is incomplete or confidence is moderate.";
  if (classification === "uncertain") return observation.confidence < 60
    ? "Numeric feet-and-inches structure is plausible, but OCR confidence is too low for promotion."
    : "Numeric feet-and-inches structure is plausible, but punctuation or unit evidence is incomplete.";
  return "Rejected by deterministic dimension validation.";
}

export function detectDimensionCandidates(
  observations: OcrObservationInput[],
): DimensionCandidate[] {
  return observations
    .filter((observation) => looksLikeDimensionCandidate(observation.text))
    .map((observation) => {
      const parsed = parseDimension(observation.text);
      const classification = classify(parsed, observation);
      return {
        originalText: observation.text,
        normalizedText: parsed?.normalizedText ?? null,
        feet: parsed?.feet ?? null,
        inches: parsed?.inches ?? null,
        decimalFeet: parsed?.decimalFeet ?? null,
        confidence: observation.confidence,
        boundingBox: observation.bbox,
        classification,
        reason: reasonFor(parsed, classification, observation),
      };
    });
}

export function summarizeDimensionCandidates(candidates: DimensionCandidate[]) {
  return {
    total: candidates.length,
    high: candidates.filter((candidate) => candidate.classification === "high").length,
    medium: candidates.filter((candidate) => candidate.classification === "medium").length,
    uncertain: candidates.filter((candidate) => candidate.classification === "uncertain").length,
    rejected: candidates.filter((candidate) => candidate.classification === "rejected").length,
  };
}
